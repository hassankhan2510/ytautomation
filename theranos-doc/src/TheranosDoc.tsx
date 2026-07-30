import {
  AbsoluteFill,
  Sequence,
  Video,
  Img,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion';
import React from 'react';

// Using standard paths for the assets we moved
import svSkyline from './assets/sv_skyline.mp4';
import bloodDrop from './assets/blood_drop.mp4';
import darkGrid from './assets/dark_grid.mp4';
import newspaper from './assets/newspaper.jpg';
import labImg from './assets/lab.jpg';
import officeImg from './assets/office.jpg';
import walgreensImg from './assets/walgreens.jpg';
import moneyImg from './assets/money.jpg';
import steveJobsImg from './assets/steve_jobs.jpg';
import courtImg from './assets/court.jpg';

// The Massive 45-Part Script (6 Minutes at 8s each)
const scriptData = [
  // ACT 1: The Myth (0:00 - 0:40)
  { text: "Silicon Valley is built on a single, intoxicating premise: that technology can solve any human problem.", asset: svSkyline, type: 'video' },
  { text: "In 2014, the valley believed it had found its next messiah. A Stanford dropout promising to revolutionize blood-testing.", asset: svSkyline, type: 'video' },
  { text: "Her name was Elizabeth Holmes. And her company, Theranos, was secretly built on a $9 billion lie.", asset: svSkyline, type: 'video' },
  { text: "To understand the scale of this fraud, we have to look at the culture that birthed it.", asset: steveJobsImg, type: 'image' },
  { text: "Investors were desperate for a female Steve Jobs. Holmes gave them exactly what they wanted to see.", asset: steveJobsImg, type: 'image' },
  
  // ACT 2: The Pitch (0:40 - 1:20)
  { text: "She dropped out of Stanford at 19 with nothing but a patent application and an idea for a wearable patch.", asset: officeImg, type: 'image' },
  { text: "When professors told her the physics of the patch were impossible, she pivoted to a blood-testing machine.", asset: officeImg, type: 'image' },
  { text: "She named the machine the 'Edison'. It was pitched as a portable lab that could run hundreds of tests on one drop of blood.", asset: bloodDrop, type: 'video' },
  { text: "The pitch was flawless. No needles. No massive vials. Just a tiny finger prick at your local pharmacy.", asset: bloodDrop, type: 'video' },
  { text: "Venture capitalists threw money at her without ever seeing a working prototype or validated scientific data.", asset: moneyImg, type: 'image' },

  // ACT 3: The Board (1:20 - 2:00)
  { text: "To legitimize her company, Holmes recruited a board of directors that looked like a shadow government.", asset: officeImg, type: 'image' },
  { text: "Henry Kissinger, George Shultz, General James Mattis. Powerful men used to intimidate skeptics.", asset: officeImg, type: 'image' },
  { text: "Almost no one on the board had any background in medicine, biology, or blood pathology.", asset: officeImg, type: 'image' },
  { text: "This political armor allowed Theranos to operate in total secrecy, claiming 'trade secrets' whenever asked for data.", asset: darkGrid, type: 'video' },
  { text: "Employees were siloed, tracked, and forced to sign suffocating non-disclosure agreements.", asset: darkGrid, type: 'video' },

  // ACT 4: The Walgreens Deal (2:00 - 2:40)
  { text: "The turning point came when Theranos partnered with Walgreens to roll out wellness centers nationwide.", asset: walgreensImg, type: 'image' },
  { text: "Walgreens executives were afraid of missing out on the next big tech disruption, so they rushed the deal.", asset: walgreensImg, type: 'image' },
  { text: "They completely bypassed standard medical vetting. Theranos was now testing real patients in retail stores.", asset: walgreensImg, type: 'image' },
  { text: "But inside the Theranos labs, the Edison machines were failing catastrophically.", asset: labImg, type: 'image' },
  { text: "The robots were dropping pipettes, breaking glass, and returning widely inaccurate results.", asset: labImg, type: 'image' },

  // ACT 5: The Physics Problem (2:40 - 3:20)
  { text: "The physics simply did not work. Capillary blood from a finger is fundamentally different from venous blood.", asset: bloodDrop, type: 'video' },
  { text: "It is contaminated with interstitial fluid and cellular debris from the tissue damage of the prick.", asset: bloodDrop, type: 'video' },
  { text: "Furthermore, you cannot run 200 distinct chemical assays on just 50 microliters of liquid.", asset: labImg, type: 'image' },
  { text: "When scientists tried to dilute the microscopic blood samples to make them stretch, the chemistry broke down.", asset: labImg, type: 'image' },
  { text: "The Edison was physically, biologically, and mathematically incapable of doing what Holmes promised.", asset: darkGrid, type: 'video' },

  // ACT 6: The Secret Siemens Labs (3:20 - 4:00)
  { text: "To hide the failure, Theranos resorted to massive, coordinated fraud across their entire operation.", asset: darkGrid, type: 'video' },
  { text: "They secretly bought commercial Siemens blood analyzers and hid them in a separate basement lab.", asset: darkGrid, type: 'video' },
  { text: "Employees were ordered to hack the Siemens machines open to accommodate the tiny, diluted patient samples.", asset: labImg, type: 'image' },
  { text: "Because the blood was artificially diluted, the results were highly erratic and statistically invalid.", asset: labImg, type: 'image' },
  { text: "Real patients were receiving terrifyingly false medical diagnostics—from fake HIV results to false cancer markers.", asset: newspaper, type: 'image' },

  // ACT 7: The Whistleblowers (4:00 - 4:40)
  { text: "The facade cracked when young whistleblowers like Tyler Shultz and Erika Cheung realized what was happening.", asset: officeImg, type: 'image' },
  { text: "They noticed that quality control data was being routinely manipulated or deleted to pass inspections.", asset: officeImg, type: 'image' },
  { text: "When they reported it to management, they were threatened with massive corporate lawsuits and intimidation tactics.", asset: officeImg, type: 'image' },
  { text: "But the secret reached Wall Street Journal reporter John Carreyrou, who began a quiet, relentless investigation.", asset: newspaper, type: 'image' },
  { text: "Despite Holmes deploying elite lawyers to kill the story, Carreyrou published the devastating exposé in 2015.", asset: newspaper, type: 'image' },

  // ACT 8: The Fall (4:40 - 5:20)
  { text: "The article destroyed the illusion instantly. Medical agencies raided the labs and banned Holmes from operating.", asset: courtImg, type: 'image' },
  { text: "The $9 billion valuation evaporated to zero overnight. The Emperor had no clothes.", asset: moneyImg, type: 'image' },
  { text: "In 2018, Elizabeth Holmes and her COO, Sunny Balwani, were indicted on federal criminal wire fraud charges.", asset: courtImg, type: 'image' },
  { text: "After a highly publicized trial, Holmes was found guilty and sentenced to 11 years in federal prison.", asset: courtImg, type: 'image' },
  { text: "Theranos remains the ultimate cautionary tale of what happens when Silicon Valley 'hustle' collides with human biology.", asset: svSkyline, type: 'video' },

  // Conclusion (5:20 - 6:00)
  { text: "You cannot patch a biological failure with a software update.", asset: svSkyline, type: 'video' },
  { text: "When deep tech founders lie to investors, they lose money. When they lie to patients, they lose lives.", asset: svSkyline, type: 'video' },
  { text: "The Theranos disaster fundamentally changed how venture capitalists evaluate biotech startups forever.", asset: moneyImg, type: 'image' },
  { text: "But the allure of the visionary founder remains. The valley is always waiting for its next messiah.", asset: steveJobsImg, type: 'image' },
  { text: "The only question is: who will they believe next?", asset: steveJobsImg, type: 'image' },
];

export const TheranosDoc: React.FC = () => {
  const { fps } = useVideoConfig();
  const textDuration = fps * 8; // 8 seconds per box

  return (
    <AbsoluteFill style={{ backgroundColor: '#0a0a0a' }}>
      {scriptData.map((scene, index) => {
        const startFrame = index * textDuration;
        let assetDuration = textDuration;
        if (index === 0 || scriptData[index - 1].asset !== scene.asset) {
           let count = 1;
           for(let i = index + 1; i < scriptData.length; i++) {
             if(scriptData[i].asset === scene.asset) count++;
             else break;
           }
           assetDuration = count * textDuration;
        } else {
           assetDuration = 0;
        }

        return (
          <Sequence key={index} from={startFrame} durationInFrames={textDuration}>
            {assetDuration > 0 && (
              <Sequence from={0} durationInFrames={assetDuration} style={{ zIndex: 0 }}>
                <AbsoluteFill>
                  {scene.type === 'video' ? (
                    <Video src={scene.asset} style={{ opacity: 0.5, objectFit: 'cover' }} muted loop />
                  ) : (
                    <Img src={scene.asset} style={{ opacity: 0.5, objectFit: 'cover', transform: 'scale(1.05)' }} />
                  )}
                </AbsoluteFill>
              </Sequence>
            )}
            
            {/* The Text Box rendered on top */}
            <div style={{ zIndex: 10, width: '100%', height: '100%' }}>
              <GlassBox text={scene.text} startFrame={0} />
            </div>
          </Sequence>
        );
      })}

      {/* GLOBAL CINEMATIC VIGNETTE OVERLAY */}
      <AbsoluteFill
        style={{
          boxShadow: 'inset 0 0 400px rgba(0,0,0,0.95)',
          pointerEvents: 'none',
          zIndex: 999
        }}
      />
    </AbsoluteFill>
  );
};

/* --- PREMIUM UI COMPONENTS --- */

const GlassBox: React.FC<{ text: string; startFrame: number }> = ({ text, startFrame }) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();

  // Aggressive Slide-In Spring (Snaps from the left)
  const slideX = spring({
    frame: frame - startFrame,
    fps,
    config: { mass: 0.4, damping: 14, stiffness: 150 },
  });

  // Micro-Floating Animation (Breathing effect)
  const floatY = Math.sin(frame / 15) * 8;

  const opacityIn = interpolate(frame, [startFrame, startFrame + 10], [0, 1], { extrapolateRight: 'clamp' });
  const opacityOut = interpolate(frame, [durationInFrames - 15, durationInFrames], [1, 0], { extrapolateLeft: 'clamp' });
  const finalOpacity = frame > durationInFrames - 15 ? opacityOut : opacityIn;

  // Retention Progress Bar (Grows from 0% to 100%)
  const progressWidth = interpolate(frame, [startFrame, durationInFrames], [0, 100], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  return (
    <AbsoluteFill style={{ justifyContent: 'flex-end', alignItems: 'flex-start', padding: '100px 150px' }}>
      <div
        style={{
          background: 'linear-gradient(135deg, rgba(20,20,20,0.85) 0%, rgba(5,5,5,0.95) 100%)',
          backdropFilter: 'blur(30px)',
          WebkitBackdropFilter: 'blur(30px)',
          borderTop: '1px solid rgba(255, 255, 255, 0.1)',
          borderRight: '1px solid rgba(255, 255, 255, 0.1)',
          borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
          borderLeft: '12px solid #e11d48', // Glowing crimson accent edge
          borderRadius: '16px',
          padding: '50px 70px',
          maxWidth: '1300px',
          opacity: finalOpacity,
          transform: `translateX(${(1 - slideX) * -500}px) translateY(${floatY}px)`, // Snap in + Float
          boxShadow: '0 40px 100px rgba(0,0,0,0.9), inset 0 0 40px rgba(225, 29, 72, 0.05)',
          overflow: 'hidden',
          position: 'relative'
        }}
      >
        <p style={{ 
            fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif', 
            fontSize: '56px', 
            fontWeight: 500, 
            color: '#f8fafc', 
            margin: 0, 
            lineHeight: 1.5, 
            letterSpacing: '-0.5px' 
        }}>
          {text}
        </p>
        
        {/* Progress Bar at the very bottom of the card */}
        <div style={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          height: '4px',
          width: `${progressWidth}%`,
          backgroundColor: '#e11d48',
          boxShadow: '0 0 20px #e11d48'
        }} />
      </div>
    </AbsoluteFill>
  );
};
