import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const supabaseUrl = Deno.env.get('SUPABASE_URL');
const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
const generateReviewUrl = Deno.env.get('GENERATE_REVIEW_URL') || 'http://localhost:3000/functions/v1/generate-review';

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  Deno.exit(1);
}

const db = createClient(supabaseUrl, supabaseKey);

interface TestResult {
  doctor_id: string;
  test_name: string;
  passed: boolean;
  message: string;
  details?: Record<string, unknown>;
}

const results: TestResult[] = [];

async function testDoctorReviews(
  doctorId: string,
  doctorName: string,
  keywords: string[],
) {
  console.log(`\n📋 Testing ${doctorName}...`);

  const deviceToken = crypto.randomUUID();

  for (let attempt = 1; attempt <= 5; attempt++) {
    console.log(`  Attempt ${attempt}/5...`);

    try {
      const response = await fetch(generateReviewUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          doctor_id: doctorId,
          device_token: deviceToken,
          rating: 4 + Math.random() > 0.5 ? 1 : 0,
          language: 'english',
          selected_chips: keywords,
        }),
      });

      if (!response.ok) {
        results.push({
          doctor_id: doctorId,
          test_name: `Attempt ${attempt}: API Response`,
          passed: false,
          message: `HTTP ${response.status}`,
        });
        continue;
      }

      const data = (await response.json()) as Record<string, unknown>;
      const reviews = Array.isArray(data.reviews)
        ? data.reviews.filter((r): r is string => typeof r === 'string')
        : [];

      // Test 1: Exactly 3 drafts
      const draftCountPass = reviews.length === 3;
      results.push({
        doctor_id: doctorId,
        test_name: `Attempt ${attempt}: Draft Count`,
        passed: draftCountPass,
        message: `Expected 3 drafts, got ${reviews.length}`,
        details: { reviews_returned: reviews.length },
      });

      if (!draftCountPass) continue;

      // Test 2: Keywords appear 2+ times per review
      const keyword_regex = keywords.map(kw =>
        new RegExp(`\\b${kw.replace(/\W/g, '\\$&')}\\b`, 'gi')
      );

      const keywordCounts = reviews.map((review, idx) => {
        const counts = keyword_regex.map(regex => {
          const matches = review.match(regex) || [];
          return matches.length;
        });
        return {
          review_index: idx,
          keyword_counts: Object.fromEntries(
            keywords.map((kw, i) => [kw, counts[i]])
          ),
          all_keywords_2_plus: counts.every(c => c >= 2),
        };
      });

      const allKeywordsPass = keywordCounts.every(
        kc => kc.all_keywords_2_plus
      );
      results.push({
        doctor_id: doctorId,
        test_name: `Attempt ${attempt}: Keywords 2+ times`,
        passed: allKeywordsPass,
        message: allKeywordsPass
          ? 'All keywords appear 2+ times'
          : 'Some keywords missing',
        details: { keyword_analysis: keywordCounts },
      });

      // Test 3: No identical reviews
      const uniqueReviews = new Set(reviews.map(r => r.trim()));
      const noIdenticalPass = uniqueReviews.size === reviews.length;
      results.push({
        doctor_id: doctorId,
        test_name: `Attempt ${attempt}: No Identical Reviews`,
        passed: noIdenticalPass,
        message: noIdenticalPass
          ? 'All 3 reviews are unique'
          : `Only ${uniqueReviews.size} unique reviews`,
        details: { unique_count: uniqueReviews.size, total_count: reviews.length },
      });

      // Test 4: Varied name/area placement (if provided)
      const patient_name = `TestPatient${Math.random().toString(36).slice(2)}`;
      const patient_locality = `TestArea${Math.random().toString(36).slice(2)}`;

      const response2 = await fetch(generateReviewUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          doctor_id: doctorId,
          device_token: deviceToken,
          rating: 5,
          language: 'english',
          selected_chips: keywords,
          patient_name,
          patient_locality,
        }),
      });

      if (response2.ok) {
        const data2 = (await response2.json()) as Record<string, unknown>;
        const reviews2 = Array.isArray(data2.reviews)
          ? data2.reviews.filter((r): r is string => typeof r === 'string')
          : [];

        const namePatterns = reviews2.map((review, idx) => {
          const lines = review.split('\n');
          const nameLineIndex = lines.findIndex(l =>
            l.toLowerCase().includes(patient_name.toLowerCase())
          );
          return {
            review_index: idx,
            name_in_line: nameLineIndex >= 0 ? nameLineIndex : -1,
            has_name: nameLineIndex >= 0,
          };
        });

        const variedPlacementPass =
          namePatterns.filter(p => p.has_name).length >= 2 &&
          new Set(namePatterns.map(p => p.name_in_line)).size > 1;
        results.push({
          doctor_id: doctorId,
          test_name: `Attempt ${attempt}: Varied Name Placement`,
          passed: variedPlacementPass,
          message: variedPlacementPass
            ? 'Name placement is varied'
            : 'Name placement not varied enough',
          details: { patterns: namePatterns },
        });
      }
    } catch (error) {
      results.push({
        doctor_id: doctorId,
        test_name: `Attempt ${attempt}: Exception`,
        passed: false,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }
}

async function main() {
  console.log('🧪 Verifying Review Generation Redesign\n');
  console.log('='.repeat(60));

  // Get test doctors
  const { data: doctors, error: doctorsError } = await db
    .from('doctors')
    .select('id,doctor_name')
    .eq('is_active', true)
    .limit(3);

  if (doctorsError || !doctors || doctors.length === 0) {
    console.error('❌ Could not fetch test doctors:', doctorsError);
    Deno.exit(1);
  }

  // Test each doctor
  for (const doctor of doctors) {
    const { data: keywords } = await db
      .from('doctor_keywords')
      .select('keyword')
      .eq('doctor_id', doctor.id)
      .limit(2);

    const keywordList = keywords?.map(k => k.keyword).filter(
      k => typeof k === 'string'
    ) as string[] || ['dental care', 'treatment'];

    await testDoctorReviews(doctor.id, doctor.doctor_name, keywordList);
  }

  // Print results
  console.log('\n' + '='.repeat(60));
  console.log('\n📊 Test Results Summary\n');

  const passed = results.filter(r => r.passed).length;
  const total = results.length;
  const passRate = ((passed / total) * 100).toFixed(1);

  console.log(`✅ Passed: ${passed}/${total} (${passRate}%)\n`);

  // Group by doctor
  const byDoctor = results.reduce(
    (acc, r) => {
      if (!acc[r.doctor_id]) acc[r.doctor_id] = [];
      acc[r.doctor_id].push(r);
      return acc;
    },
    {} as Record<string, TestResult[]>
  );

  for (const [doctorId, doctorResults] of Object.entries(byDoctor)) {
    const doctor = doctors.find(d => d.id === doctorId);
    console.log(`\n${doctor?.doctor_name || doctorId}`);
    console.log('-'.repeat(40));

    for (const result of doctorResults) {
      const icon = result.passed ? '✅' : '❌';
      console.log(`${icon} ${result.test_name}: ${result.message}`);
    }
  }

  console.log('\n' + '='.repeat(60));
  console.log(`\n🎯 Overall: ${passRate}% pass rate`);

  if (passed === total) {
    console.log('✨ All tests passed! Redesign is working correctly.\n');
    Deno.exit(0);
  } else {
    console.log(`⚠️  ${total - passed} tests failed. Review the details above.\n`);
    Deno.exit(1);
  }
}

await main();
