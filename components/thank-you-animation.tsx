'use client';

import { useEffect, useRef } from 'react';
import Lottie, { type LottieRefCurrentProps } from 'lottie-react';
import thankYouAnimation from '@/thankyou.json';

export default function ThankYouAnimation(){
  const animationRef=useRef<LottieRefCurrentProps>(null);
  useEffect(()=>{animationRef.current?.setSpeed(0.72);animationRef.current?.goToAndPlay(0,true)},[]);
  return <div className="mx-auto mb-4 h-44 w-44 md:h-56 md:w-56" aria-label="Review copied successfully">
    <Lottie lottieRef={animationRef} animationData={thankYouAnimation} loop={true} autoplay={true} className="h-full w-full" rendererSettings={{preserveAspectRatio:'xMidYMid meet'}} />
  </div>;
}
