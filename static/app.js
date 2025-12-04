/************************************************************
 * Reversal Learning Task - Frontend Logic
 * This script:
 *  - Walks participant through instructions
 *  - Runs learning blocks (3 or 4) + reversal blocks (3)
 *  - Replicates PsychoPy timing (fixation -> choice -> short pause -> gotme -> feedback)
 *  - Logs trial/block/task data to Flask, which appends to Google Sheets
 ************************************************************/

/* =======================
   GLOBAL CONFIG
   ======================= */

/*
We assume 4 stimulus images: exp1.png ... exp4.png.
We'll index them as 0..3 internally and map to filenames.
*/
const IMAGE_FILES = [
  "exp1.png",
  "exp2.png",
  "exp3.png",
  "exp4.png"
];

/*
Instruction sequence images. Shown in order.
*/
const INSTR_IMAGES = [
  "instr1.png",
  "instr2.png",
  "instr3.png",
  "instr4.png",
  "instr5.png"
];

/*
Pair definitions:
- Pair 1: images 0 and 1 (exp1.png, exp2.png)
- Pair 2: images 2 and 3 (exp3.png, exp4.png)

For each subject, we randomly assign:
- One pair as "learning" (correct image stays same in reversal)
- One pair as "reversal" (correct image switches in reversal)
*/
const PAIR_1 = [0, 1]; // exp1.png, exp2.png
const PAIR_2 = [2, 3]; // exp3.png, exp4.png

/*
Version map stores which image in each pair is correct during learning phase.
In reversal phase:
- Learning pair: same correct image
- Reversal pair: opposite image becomes correct
*/
const VERSION_MAP = {
  1: { pair1Correct: 0, pair2Correct: 2 }, // pair1: img0 correct, pair2: img2 correct
  2: { pair1Correct: 0, pair2Correct: 3 }, // pair1: img0 correct, pair2: img3 correct
  3: { pair1Correct: 1, pair2Correct: 2 }, // pair1: img1 correct, pair2: img2 correct
  4: { pair1Correct: 1, pair2Correct: 3 }  // pair1: img1 correct, pair2: img3 correct
};

/*
Timing parameters in ms,
mimicking PsychoPy:
- fixation 500ms
- show 2 choice imgs until click
- after click: keep both on screen w/ chosen dimmed for 400ms
- gotme screen (intermediate feedback prep) 600ms
- feedback screen ~1500ms (+ optional flash ~200ms)
We'll approximate 1500ms + 200ms = 1700ms total.
*/
const T_FIXATION = 500;
const T_POST_CHOICE = 400;
const T_PRE_FEEDBACK = 600;
const T_FEEDBACK = 1700;

/*
Chance of "misleading" feedback - 0.20 (20%)
That means:
 - If you pick correct img: 80% win (valid_win), 20% = invalid_lose
 - If you pick wrong img: 80% lose (valid_lose), 20% = invalid_win
*/
const MISLEAD_THRESHOLD = 0.20;

/*
Number of trials per block.
In PsychoPy each block effectively had 20 real choice trials.
*/
const TRIALS_PER_BLOCK = 20;

/*
Learning phase has up to 4 blocks:
 - After 3 blocks we check if participant "learned"
   (>=7 correct choices for each high-prob image)
 - If learned, skip block 4
Reversal phase: 3 blocks, always done.
*/
const MAX_LEARNING_BLOCKS = 4;
const REVERSAL_BLOCKS = 3;
const LEARNING_CRITERION = 7; // at least 7 "correct" choices per each high option by end of block 3

/* =======================
   STATE
   ======================= */

let state = {
  subId: null,
  version: 1,
  score: 0,

  // pair assignment (randomly determined per subject)
  reversalPair: null, // "pair1" or "pair2" - which pair reverses
  learningPair: null, // "pair1" or "pair2" - which pair stays same

  // experiment plan:
  blocks: [], // array of {blockNumber, blockType, highSet, trials: [...], summary: {...}}
  currentBlockIdx: 0,
  currentTrialIdx: 0,

  // learning criterion tracking
  skipFourthLearning: false,

  // summary tracking
  totalRewardsLearning: 0,
  totalRewardsReversal: 0,
  blockRewardCounts: {}, // blockNumber -> rewardCount
  
  // timing tracking
  allTrialDurations: [], // all trial durations in seconds
  learningTrialDurations: [], // learning phase durations
  reversalTrialDurations: [], // reversal phase durations
  
  // phase duration tracking
  allReactionDurations: [],
  learningReactionDurations: [],
  reversalReactionDurations: [],
  allFixationDurations: [],
  learningFixationDurations: [],
  reversalFixationDurations: [],
  allStimulusDurations: [],
  learningStimulusDurations: [],
  reversalStimulusDurations: [],
  allFeedbackDurations: [],
  learningFeedbackDurations: [],
  reversalFeedbackDurations: [],
  
  // side selection tracking
  totalLeftSelections: 0,
  totalRightSelections: 0,
};

/* =======================
   DOM ELEMENTS
   ======================= */

const startScreenEl = document.getElementById("start-screen");
const phoneFlipScreenEl = document.getElementById("phone-flip-screen");
// const mobileInstructionsScreenEl = document.getElementById("mobile-instructions-screen");
const instrScreenEl = document.getElementById("instructions-screen");
const taskScreenEl  = document.getElementById("task-screen");
const confidenceScreenEl = document.getElementById("confidence-screen");
const endScreenEl   = document.getElementById("end-screen");

const instrImageEl  = document.getElementById("instr-image");
const nextInstrBtn  = document.getElementById("next-instr-btn");

const scoreValEl    = document.getElementById("score-val");
const fixationImgEl = document.getElementById("fixation-img");
const leftImgEl     = document.getElementById("left-img");
const rightImgEl    = document.getElementById("right-img");
const gotmeImgEl    = document.getElementById("gotme-img");
const feedbackContainerEl = document.getElementById("feedback-container");
const feedbackTextImgEl = document.getElementById("feedback-text-img");
const feedbackResultImgEl = document.getElementById("feedback-result-img");
const blockMsgEl    = document.getElementById("block-msg");

const finalScoreEl  = document.getElementById("final-score");
const thankyouImgEl = document.getElementById("thankyou-img"); // re-using blank.jpg, can replace with a "thank you" img

const startBtn      = document.getElementById("start-btn");
const partIdInput   = document.getElementById("participant-id");
const phoneFlipVideo = document.getElementById("phone-flip-video");
const flipConfirmBtn = document.getElementById("flip-confirm-btn");

// Confidence rating elements
const submitConfidenceBtn = document.getElementById("submit-confidence-btn");
const confidenceCurrentImg = document.getElementById("confidence-current-img");
const confidenceSlider = document.getElementById("confidence-slider");

// Debug info elements
const debugVersionEl = document.getElementById("debug-version");
const debugBlockEl = document.getElementById("debug-block");
const debugBlockTypeEl = document.getElementById("debug-block-type");
const debugTrialEl = document.getElementById("debug-trial");
const debugScoreEl = document.getElementById("debug-score");
const debugReversalPairEl = document.getElementById("debug-reversal-pair");
const debugLearningPairEl = document.getElementById("debug-learning-pair");
const debugHighSetEl = document.getElementById("debug-high-set");

// MOBILE INSTRUCTIONS SCREEN ELEMENTS (Disabled due to ONLY MOBILE USAGE)
// const mobileInstructionsBtn = document.getElementById("mobile-instructions-btn");


/* =======================
   SCREEN HELPERS
   ======================= */

function showScreen(screenEl) {
  [startScreenEl, phoneFlipScreenEl, instrScreenEl, taskScreenEl, confidenceScreenEl, endScreenEl].forEach(s => {
    s.classList.add("hidden");
    s.classList.remove("visible");
  });
  screenEl.classList.remove("hidden");
  screenEl.classList.add("visible");
}

function hideAllTaskElems() {
  fixationImgEl.classList.add("hidden");
  leftImgEl.classList.add("hidden");
  rightImgEl.classList.add("hidden");
  gotmeImgEl.classList.add("hidden");
  feedbackContainerEl.classList.add("hidden");
  blockMsgEl.classList.add("hidden");

  leftImgEl.classList.remove("dimmed");
  rightImgEl.classList.remove("dimmed");
  leftImgEl.style.pointerEvents = "none";
  rightImgEl.style.pointerEvents = "none";
}

function updateDebugInfo(block, trialNumber) {
  // Map image files to readable names
  const imageNameMap = {
    "exp1.png": "app_green",
    "exp2.png": "app_purp",
    "exp3.png": "orng_orng",
    "exp4.png": "orng_purp"
  };
  
  // Map pair names to readable names
  const pairNameMap = {
    "pair1": "apples",
    "pair2": "orange"
  };
  
  debugVersionEl.textContent = state.version;
  debugBlockEl.textContent = block ? block.blockNumber : "-";
  debugBlockTypeEl.textContent = block ? block.blockType : "-";
  debugTrialEl.textContent = trialNumber || "-";
  debugScoreEl.textContent = state.score;
  debugReversalPairEl.textContent = state.reversalPair ? pairNameMap[state.reversalPair] + " (reversed)" : "-";
  debugLearningPairEl.textContent = state.learningPair ? pairNameMap[state.learningPair] + " (non-reversed)" : "-";
  if (block && block.highSet) {
    const highSetStr = block.highSet.map(i => imageNameMap[IMAGE_FILES[i]]).join(", ");
    debugHighSetEl.textContent = highSetStr;
  } else {
    debugHighSetEl.textContent = "-";
  }
}

/* =======================
   UTILS
   ======================= */

function randChoice(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function shuffleArray(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function getTimestamp() {
  // client timestamp; server will also stamp
  return new Date().toISOString();
}

/*
Split ISO timestamp into date (yyyy-mm-dd) and time (hh:mm:ss.ms)
Returns object with date and time properties
*/
function splitTimestamp(isoString) {
  if (!isoString) return { date: "", time: "" };
  
  const date = new Date(isoString);
  
  // Format date as yyyy-mm-dd
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const dateStr = `${year}-${month}-${day}`;
  
  // Format time as hh:mm:ss.ms
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const seconds = String(date.getSeconds()).padStart(2, '0');
  const milliseconds = String(date.getMilliseconds()).padStart(3, '0');
  const timeStr = `${hours}:${minutes}:${seconds}.${milliseconds}`;
  
  return { date: dateStr, time: timeStr };
}

/*
Generate 20 trials for a given block with a specified highSet (2 images that
have 0.75 reward probability). We'll pair each high with each low repeatedly.

Return an array of objects:
{
  highImg: number,  // index of high image in IMAGE_FILES
  lowImg:  number,  // index of low image
  leftImg: number,  // index actually shown on left for THIS TRIAL
  rightImg: number, // index actually shown on right for THIS TRIAL
}
*/
// Generate predetermined misleading schedule: 80% valid, 20% misleading
// For 20 trials: 16 valid (no mislead), 4 misleading
function generateMisleadingSchedule(numTrials) {
  const numMisleading = Math.round(numTrials * MISLEAD_THRESHOLD);
  const schedule = Array(numTrials).fill(0); // 0 = no mislead
  
  // Randomly select which trials will be misleading
  const misleadingIndices = [];
  while (misleadingIndices.length < numMisleading) {
    const idx = Math.floor(Math.random() * numTrials);
    if (!misleadingIndices.includes(idx)) {
      misleadingIndices.push(idx);
      schedule[idx] = 1; // 1 = misleading
    }
  }
  
  return schedule;
}

function generateTrialsForBlock(highSet, blockType) {
  const imgsAll = [0,1,2,3];
  const lowSet = imgsAll.filter(x => !highSet.includes(x));

  // Helper function to check if two images can appear together
  // Images 0,1 (exp1.png, exp2.png) should never appear with images 2,3 (exp3.png, exp4.png)
  function canPairImages(img1, img2) {
    const group1 = [0, 1]; // exp1.png, exp2.png
    const group2 = [2, 3]; // exp3.png, exp4.png
    
    const img1InGroup1 = group1.includes(img1);
    const img1InGroup2 = group2.includes(img1);
    const img2InGroup1 = group1.includes(img2);
    const img2InGroup2 = group2.includes(img2);
    
    // Both must be in the same group
    return (img1InGroup1 && img2InGroup1) || (img1InGroup2 && img2InGroup2);
  }
  
  // Helper to identify which pair a trial belongs to
  function getPairId(highImg, lowImg) {
    if (PAIR_1.includes(highImg) && PAIR_1.includes(lowImg)) return "pair1";
    if (PAIR_2.includes(highImg) && PAIR_2.includes(lowImg)) return "pair2";
    return "unknown";
  }

  // all unique (high x low) pairs that satisfy the constraint:
  let basePairs = [];
  highSet.forEach(h => {
    lowSet.forEach(l => {
      if (canPairImages(h, l)) {
        basePairs.push({h, l, pairId: getPairId(h, l)});
      }
    });
  });
  // basePairs will have valid pairs only

  // If we have no valid pairs, throw an error
  if (basePairs.length === 0) {
    throw new Error(`No valid pairings found for highSet: ${highSet}. Images 0-1 cannot pair with images 2-3.`);
  }

  // Generate trials with constraints:
  // 1. No pair appears 3 times in a row
  // 2. After seeing a pair, 50% chance to see same pair, 50% chance to see other pair
  //    Within the 50% same pair: 50% same sides, 50% flipped
  //    Within the 50% other pair: 50% orientation 1, 50% orientation 2
  
  let trials = [];
  let pairCounts = {}; // Track how many times each pair has been used
  basePairs.forEach(p => pairCounts[p.pairId] = 0);
  
  const totalTrialsNeeded = TRIALS_PER_BLOCK;
  const trialsPerPair = totalTrialsNeeded / basePairs.length;
  
  // Generate first trial randomly
  let lastPairId = null;
  let consecutiveCount = 0;
  
  for (let i = 0; i < totalTrialsNeeded; i++) {
    let availablePairs = [];
    
    if (i === 0) {
      // First trial: any pair is fine
      availablePairs = basePairs.slice();
    } else {
      // Determine next pair based on probability and constraints
      const samePairProb = 0.5;
      const shouldBeSamePair = Math.random() < samePairProb;
      
      if (shouldBeSamePair && consecutiveCount < 2) {
        // Try to use same pair (if not hitting 3 in a row)
        availablePairs = basePairs.filter(p => p.pairId === lastPairId);
      } else if (consecutiveCount >= 2) {
        // MUST switch pairs (hitting limit of 2 consecutive)
        availablePairs = basePairs.filter(p => p.pairId !== lastPairId);
      } else {
        // Switch to other pair
        availablePairs = basePairs.filter(p => p.pairId !== lastPairId);
      }
      
      // If no available pairs (shouldn't happen), fall back to any pair
      if (availablePairs.length === 0) {
        availablePairs = basePairs.slice();
      }
    }
    
    // Select from available pairs, preferring those with fewer uses
    availablePairs.sort((a, b) => pairCounts[a.pairId] - pairCounts[b.pairId]);
    const selectedPair = availablePairs[0];
    
    // Create trial
    trials.push({
      highImg: selectedPair.h,
      lowImg: selectedPair.l,
      pairId: selectedPair.pairId
    });
    
    // Update tracking
    pairCounts[selectedPair.pairId]++;
    
    if (selectedPair.pairId === lastPairId) {
      consecutiveCount++;
    } else {
      consecutiveCount = 1;
      lastPairId = selectedPair.pairId;
    }
  }

  // Generate predetermined misleading schedule
  const misleadingSchedule = generateMisleadingSchedule(trials.length);
  
  // Assign left/right orientation with proper probability
  // For each trial after the first, if it's the same pair as previous:
  //   50% chance same orientation, 50% chance flipped
  // If different pair: random orientation
  
  trials.forEach((tr, idx) => {
    // Determine which pair this trial belongs to
    const isPair1 = PAIR_1.includes(tr.highImg) && PAIR_1.includes(tr.lowImg);
    const isPair2 = PAIR_2.includes(tr.highImg) && PAIR_2.includes(tr.lowImg);
    
    // Determine pair_type based on which pair this is and subject's assignment
    if (isPair1) {
      tr.pair_type = (state.reversalPair === "pair1") ? "reversed" : "non-reversed";
    } else if (isPair2) {
      tr.pair_type = (state.reversalPair === "pair2") ? "reversed" : "non-reversed";
    } else {
      tr.pair_type = "unknown";
    }
    
    // Attach predetermined misleading flag for this trial
    tr.misleading = misleadingSchedule[idx];
    
    // Determine orientation
    let flipLR;
    if (idx > 0 && tr.pairId === trials[idx - 1].pairId) {
      // Same pair as previous trial
      // 50% chance to keep same orientation, 50% to flip
      if (Math.random() < 0.5) {
        flipLR = trials[idx - 1].flipLR; // Same orientation
      } else {
        flipLR = 1 - trials[idx - 1].flipLR; // Flipped
      }
    } else {
      // Different pair or first trial: random orientation
      flipLR = Math.random() < 0.5 ? 0 : 1;
    }
    
    if (flipLR === 0) {
      tr.leftImg  = tr.highImg;
      tr.rightImg = tr.lowImg;
      tr.flipLR   = 0;
    } else {
      tr.leftImg  = tr.lowImg;
      tr.rightImg = tr.highImg;
      tr.flipLR   = 1;
    }
  });

  return trials;
}

/*
Build the full experiment plan:
- Learning blocks first (up to 4, we might skip #4 later)
- Reversal blocks next (3 blocks)
Each entry has blockNumber, blockType ("learning"/"reversal"), highSet (2 ids),
and trials[].
*/
function buildExperimentBlocks(version) {
  const mapConf = VERSION_MAP[version];
  if (!mapConf) {
    throw new Error("Unknown version mapping");
  }

  // Randomly assign which pair is reversal and which is learning
  state.reversalPair = Math.random() < 0.5 ? "pair1" : "pair2";
  state.learningPair = state.reversalPair === "pair1" ? "pair2" : "pair1";

  // Build high sets for learning phase
  // Both pairs use their version-defined correct images
  const learningHigh = [mapConf.pair1Correct, mapConf.pair2Correct];

  // Build high sets for reversal phase
  // Reversal pair: switch to opposite image
  // Learning pair: keep same correct image
  let reversalHigh;
  if (state.reversalPair === "pair1") {
    // Pair 1 reverses, Pair 2 stays same
    const pair1Reversed = PAIR_1.find(img => img !== mapConf.pair1Correct);
    reversalHigh = [pair1Reversed, mapConf.pair2Correct];
  } else {
    // Pair 2 reverses, Pair 1 stays same
    const pair2Reversed = PAIR_2.find(img => img !== mapConf.pair2Correct);
    reversalHigh = [mapConf.pair1Correct, pair2Reversed];
  }

  let blocks = [];
  let blockCounter = 1;

  // Learning: 4 potential blocks
  for (let b = 0; b < MAX_LEARNING_BLOCKS; b++) {
    // The 4th learning block gets number 3.5 (optional block)
    const blockNum = b === 3 ? 3.5 : blockCounter;
    
    blocks.push({
      blockNumber: blockNum,
      blockType: "learning",
      highSet: learningHigh.slice(),
      trials: generateTrialsForBlock(learningHigh, "learning"),
      summary: { trialDurations: [] }
    });
    
    if (b !== 3) {
      blockCounter += 1;
    }
  }
  
  blockCounter = 4; // Start reversal blocks at 4

  // Reversal: 3 blocks
  for (let b = 0; b < REVERSAL_BLOCKS; b++) {
    blocks.push({
      blockNumber: blockCounter,
      blockType: "reversal",
      highSet: reversalHigh.slice(),
      trials: generateTrialsForBlock(reversalHigh, "reversal"),
      summary: { trialDurations: [] }
    });
    blockCounter += 1;
  }

  return blocks;
}

/* =======================
   LOGGING HELPERS
   ======================= */

/*
POST JSON helper for trial/block/task logging to Flask.
*/
async function postJSON(url, payload) {
  try {
    const resp = await fetch(url, {
      method: "POST",
      headers: {"Content-Type": "application/json"},
      body: JSON.stringify(payload)
    });
    return await resp.json();
  } catch (err) {
    console.error("POST error", url, err, payload);
    // we don't block the experiment, but we log the error in console
    return {status: "error", message: err.toString()};
  }
}

/*
Helper function to calculate mean and standard deviation
*/
function calculateStats(values) {
  if (values.length === 0) return { mean: 0, std: 0 };
  const mean = values.reduce((sum, val) => sum + val, 0) / values.length;
  if (values.length === 1) return { mean, std: 0 };
  const variance = values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / values.length;
  const std = Math.sqrt(variance);
  return { mean, std };
}

/*
Log single trial to /log_trial with the required columns.
*/
async function logTrialData(trialPayload) {
  await postJSON("/log_trial", trialPayload);
}

/*
Log multiple trials in bulk to /log_trials_bulk.
*/
async function logTrialsBulk(trialsArray) {
  await postJSON("/log_trials_bulk", { trials: trialsArray });
}

/*
Log block summary to /log_block.
*/
async function logBlockData(blockPayload) {
  await postJSON("/log_block", blockPayload);
}

/*
Log final task summary to /log_task.
*/
async function logTaskData(taskPayload) {
  await postJSON("/log_task", taskPayload);
}


/* =======================
   CORE TASK FLOW
   ======================= */

/*
Run the full experiment flow:
1. We'll show a "get ready" message for each block
2. We'll iterate through its trials
3. After block 3 of learning, we check if skipFourthLearning
4. After all learning blocks (3 or 4), we run reversal blocks (3)
5. Then finalize and show thank-you screen
*/

async function runExperiment() {
  console.log("=== Starting Experiment ===");
  console.log("Subject ID:", state.subId);
  console.log("Version:", state.version);
  console.log("Reversal Pair:", state.reversalPair);
  console.log("Learning Pair:", state.learningPair);
  console.log("Total blocks:", state.blocks.length);
  state.currentBlockIdx = 0;
  
  // Initialize debug info
  updateDebugInfo(null, null);
  
  await runNextBlock();
}

/*
Show confidence rating screen and collect ratings for all 4 images.
Shows one image at a time. Returns a promise that resolves with the ratings object.
*/
async function showConfidenceRating() {
  console.log("Showing confidence ratings...");
  const ratings = {};
  const images = [
    { id: 1, src: "/images/exp1.png" },
    { id: 2, src: "/images/exp2.png" },
    { id: 3, src: "/images/exp3.png" },
    { id: 4, src: "/images/exp4.png" }
  ];

  for (const img of images) {
    // Reset slider to middle value (50)
    confidenceSlider.value = 50;

    // Set current image
    confidenceCurrentImg.src = img.src;

    // Disable submit button initially
    submitConfidenceBtn.disabled = true;
    submitConfidenceBtn.style.opacity = "0.5";
    submitConfidenceBtn.style.cursor = "not-allowed";

    // Show confidence screen
    showScreen(confidenceScreenEl);

    // Wait for user to submit rating
    const rating = await new Promise((resolve) => {
      let hasInteracted = false;
      
      const handleSliderInteraction = () => {
        if (!hasInteracted) {
          hasInteracted = true;
          submitConfidenceBtn.disabled = false;
          submitConfidenceBtn.style.opacity = "1";
          submitConfidenceBtn.style.cursor = "pointer";
          // Remove the listener after first interaction
          confidenceSlider.removeEventListener("input", handleSliderInteraction);
          confidenceSlider.removeEventListener("change", handleSliderInteraction);
        }
      };
      
      const handleSubmit = () => {
        const value = parseInt(confidenceSlider.value);
        submitConfidenceBtn.removeEventListener("click", handleSubmit);
        confidenceSlider.removeEventListener("input", handleSliderInteraction);
        confidenceSlider.removeEventListener("change", handleSliderInteraction);
        resolve(value);
      };
      
      // Listen for slider interaction
      confidenceSlider.addEventListener("input", handleSliderInteraction);
      confidenceSlider.addEventListener("change", handleSliderInteraction);
      
      submitConfidenceBtn.addEventListener("click", handleSubmit);
    });

    ratings[`est_img${img.id}`] = rating;
    console.log(`  Image ${img.id} confidence: ${rating}`);
  }

  console.log("All confidence ratings collected:", ratings);
  return ratings;
}

async function runNextBlock() {
  console.log("\n--- runNextBlock called, blockIdx:", state.currentBlockIdx);
  
  // Check if we've exhausted blocks
  if (state.currentBlockIdx >= state.blocks.length) {
    console.log("All blocks completed, ending experiment");
    // we're done with *all* pre-planned blocks (including that #4 learning
    // may have been skipped logically, but still "exists" in array if skip=false).
    await endExperiment();
    return;
  }

  let block = state.blocks[state.currentBlockIdx];
  console.log("Starting block:", block.blockNumber, "Type:", block.blockType);
  console.log("High set:", block.highSet);
  console.log("Number of trials:", block.trials.length);
  
  // Update debug info for new block
  updateDebugInfo(block, 0);

  // special case: skip learning block #4 if criterion met
  if (block.blockType === "learning") {
    // Are we at learning block #4 (index 3) and did we mark skipFourthLearning?
    // Note that the 4th learning block has blockType "learning" but is index 3 of
    // the learning portion. We'll skip if state.skipFourthLearning == true and
    // this is the 4th learning block (by "learningIndex" == 3).
    const learningIdx = getLearningIndexForCurrentBlock();
    if (learningIdx === 3 && state.skipFourthLearning) {
      console.log("Skipping 4th learning block (criterion met)");
      // Skip this block and move on
      state.currentBlockIdx += 1;
      await runNextBlock();
      return;
    }
  }

  // Show block intro
  await showBlockIntro(block);

  // Run all trials in this block
  state.currentTrialIdx = 0;
  block.summary.rewardCount = 0;
  block.summary.leftSelections = 0;
  block.summary.rightSelections = 0;
  block.summary.trialPayloads = []; // Store trial data to send in bulk
  block.summary.reactionDurations = [];
  block.summary.fixationDurations = [];
  block.summary.stimulusDurations = [];
  block.summary.feedbackDurations = [];

  // track per-high-image correct counts (for learning criterion check)
  const highA = block.highSet[0];
  const highB = block.highSet[1];
  let correctCounts = {};
  correctCounts[highA] = 0;
  correctCounts[highB] = 0;
  
  // Track observed rewards per image for calculating actual probabilities
  let imageRewardCounts = {0: 0, 1: 0, 2: 0, 3: 0}; // times each image was rewarded
  let imageChosenCounts = {0: 0, 1: 0, 2: 0, 3: 0}; // times each image was chosen

  while (state.currentTrialIdx < block.trials.length) {
    let trialObj = block.trials[state.currentTrialIdx];
    const trialNumber = state.currentTrialIdx + 1;
    
    // Update debug info for current trial
    updateDebugInfo(block, trialNumber);

    const trialResult = await runSingleTrial(block, trialObj, trialNumber);

    // Store trial payload for bulk sending
    if (trialResult.trialPayload) {
      block.summary.trialPayloads.push(trialResult.trialPayload);
    }

    // update block summary
    if (trialResult.reward_received === 1) {
      block.summary.rewardCount += 1;
    }
    
    // Track per-image statistics
    const chosenImgIdx = trialResult.chosen_img_index;
    imageChosenCounts[chosenImgIdx] += 1;
    if (trialResult.reward_received === 1) {
      imageRewardCounts[chosenImgIdx] += 1;
    }
    
    // track side selections
    if (trialResult.selected_side === "left") {
      block.summary.leftSelections += 1;
      state.totalLeftSelections += 1;
    } else {
      block.summary.rightSelections += 1;
      state.totalRightSelections += 1;
    }
    
    // store trial duration for block statistics
    if (trialResult.trial_duration !== undefined) {
      block.summary.trialDurations.push(trialResult.trial_duration);
    }
    
    // store phase durations for block statistics
    if (trialResult.trial_duration !== undefined) {
      block.summary.reactionDurations.push(trialResult.trial_duration);
    }
    if (trialResult.fixation_duration !== undefined) {
      block.summary.fixationDurations.push(trialResult.fixation_duration);
    }
    if (trialResult.stimulus_duration !== undefined) {
      block.summary.stimulusDurations.push(trialResult.stimulus_duration);
    }
    if (trialResult.feedback_duration !== undefined) {
      block.summary.feedbackDurations.push(trialResult.feedback_duration);
    }

    // track if participant chose a "correct" (high-prob) image
    if (trialResult.chosen_is_high === 1) {
      // chosenHighIdx is the actual image index that was high
      const chosenHighIdx = trialResult.chosen_img_index;
      if (correctCounts.hasOwnProperty(chosenHighIdx)) {
        correctCounts[chosenHighIdx] += 1;
      }
    }

    state.currentTrialIdx += 1;
  }

  // finalize block summary
  block.summary.n_trials = block.trials.length;
  block.summary.correctCounts = correctCounts;

  // accumulate rewards for learning vs reversal
  if (block.blockType === "learning") {
    state.totalRewardsLearning += block.summary.rewardCount;
  } else {
    state.totalRewardsReversal += block.summary.rewardCount;
  }
  // store block reward count for later "highest reward block"
  state.blockRewardCounts[block.blockNumber] = block.summary.rewardCount;

  // Get expected probabilities per image (0.8 for high set, 0.2 for low set)
  const expectedProbs = getProbabilitiesForImages(block.highSet);
  
  // Determine "learner_status" for this block: did they satisfy learning criterion?
  // We define: learner_status = 1 if both high images >=7 correct choices
  // Only meaningful in learning phase block >=3
  let learnerStatus = 0;
  if (block.blockType === "learning") {
    const highAcount = correctCounts[highA] || 0;
    const highBcount = correctCounts[highB] || 0;
    if (highAcount >= LEARNING_CRITERION && highBcount >= LEARNING_CRITERION) {
      learnerStatus = 1;
    }
  }

  // Calculate block duration statistics
  const blockDurations = block.summary.trialDurations || [];
  const blockStats = calculateStats(blockDurations);
  
  const reactionStats = calculateStats(block.summary.reactionDurations || []);
  const fixationStats = calculateStats(block.summary.fixationDurations || []);
  const stimulusStats = calculateStats(block.summary.stimulusDurations || []);
  const feedbackStats = calculateStats(block.summary.feedbackDurations || []);

  console.log("Block", block.blockNumber, "summary:");
  console.log("  Rewards:", block.summary.rewardCount);
  console.log("  Learner status:", learnerStatus);
  console.log("  Avg trial duration:", blockStats.mean.toFixed(3), "s");
  console.log("  Avg reaction duration:", reactionStats.mean.toFixed(3), "s");
  console.log("  Avg fixation duration:", fixationStats.mean.toFixed(3), "s");
  console.log("  Avg stimulus duration:", stimulusStats.mean.toFixed(3), "s");
  console.log("  Avg feedback duration:", feedbackStats.mean.toFixed(3), "s");

  // Show confidence rating screen and collect ratings
  showScreen(taskScreenEl); // go back to task screen to show confidence
  const confidenceRatings = await showConfidenceRating();
  
  // Map confidence ratings to pair-based estimates
  // Determine which images are correct/wrong in each pair for THIS block
  const mapConf = VERSION_MAP[state.version];
  const pair1CorrectImg = block.blockType === "learning" ? 
    mapConf.pair1Correct : 
    (state.reversalPair === "pair1" ? PAIR_1.find(i => i !== mapConf.pair1Correct) : mapConf.pair1Correct);
  const pair1WrongImg = PAIR_1.find(i => i !== pair1CorrectImg);
  
  const pair2CorrectImg = block.blockType === "learning" ? 
    mapConf.pair2Correct : 
    (state.reversalPair === "pair2" ? PAIR_2.find(i => i !== mapConf.pair2Correct) : mapConf.pair2Correct);
  const pair2WrongImg = PAIR_2.find(i => i !== pair2CorrectImg);
  
  // Determine which pair is reversed and which is non-reversed
  const reversedCorrectImg = state.reversalPair === "pair1" ? pair1CorrectImg : pair2CorrectImg;
  const reversedWrongImg = state.reversalPair === "pair1" ? pair1WrongImg : pair2WrongImg;
  const nonReversedCorrectImg = state.reversalPair === "pair1" ? pair2CorrectImg : pair1CorrectImg;
  const nonReversedWrongImg = state.reversalPair === "pair1" ? pair2WrongImg : pair1WrongImg;
  
  const est_correct_reversed = confidenceRatings[`est_img${reversedCorrectImg + 1}`];
  const est_wrong_reversed = confidenceRatings[`est_img${reversedWrongImg + 1}`];
  const est_correct_non_reversed = confidenceRatings[`est_img${nonReversedCorrectImg + 1}`];
  const est_wrong_non_reversed = confidenceRatings[`est_img${nonReversedWrongImg + 1}`];

  // Calculate left selection percentage
  const totalSelections = block.summary.leftSelections + block.summary.rightSelections;
  const leftPercent = totalSelections > 0 ? (block.summary.leftSelections / totalSelections) * 100 : 0;
  
  const blockPayload = {
    sub_id: state.subId,
    block_number: block.blockNumber,
    block_type: block.blockType,
    n_trials: block.summary.n_trials,
    p_img1: expectedProbs[0],
    p_img2: expectedProbs[1],
    p_img3: expectedProbs[2],
    p_img4: expectedProbs[3],
    reward_count: block.summary.rewardCount,
    learner_status: learnerStatus,
    avg_trial_duration: blockStats.mean,
    std_trial_duration: blockStats.std,
    avg_reaction_duration: reactionStats.mean,
    std_reaction_duration: reactionStats.std,
    avg_fixation_duration: fixationStats.mean,
    std_fixation_duration: fixationStats.std,
    avg_stimulus_duration: stimulusStats.mean,
    std_stimulus_duration: stimulusStats.std,
    avg_feedback_duration: feedbackStats.mean,
    std_feedback_duration: feedbackStats.std,
    est_correct_reversed: est_correct_reversed,
    est_wrong_reversed: est_wrong_reversed,
    est_correct_non_reversed: est_correct_non_reversed,
    est_wrong_non_reversed: est_wrong_non_reversed,
    selected_left_count: block.summary.leftSelections,
    selected_right_count: block.summary.rightSelections,
    selected_left_percent: leftPercent
  };
  
  // Send all trial data in bulk first
  console.log(`Sending ${block.summary.trialPayloads.length} trial records in bulk...`);
  await postJSON("/log_trials_bulk", { trials: block.summary.trialPayloads });
  
  // Then send block data
  console.log("Sending block data...");
  await logBlockData(blockPayload);
  
  // Update and send task data after each block
  console.log("Updating task data...");
  const taskPayload = buildTaskPayload(false); // isFinished = false for in-progress
  await logTaskData(taskPayload);
  
  // Return to task screen for next block
  showScreen(taskScreenEl);

  // After block 3 of learning, decide if we skip 4th
  if (
    block.blockType === "learning" &&
    getLearningIndexForCurrentBlock() === 2 // 0-based => block #3 of learning
  ) {
    const highAcount = correctCounts[highA] || 0;
    const highBcount = correctCounts[highB] || 0;
    console.log("Checking learning criterion after block 3:");
    console.log("  Image", highA, "correct count:", highAcount);
    console.log("  Image", highB, "correct count:", highBcount);
    console.log("  Criterion:", LEARNING_CRITERION);
    if (highAcount >= LEARNING_CRITERION && highBcount >= LEARNING_CRITERION) {
      console.log("  ✓ Criterion met! Will skip 4th learning block");
      state.skipFourthLearning = true;
    } else {
      console.log("  ✗ Criterion not met, will run 4th learning block");
    }
  }

  // Advance block
  state.currentBlockIdx += 1;
  await runNextBlock();
}

/*
Return which learning block index we are on (0,1,2,3) if current block is learning,
else null. We infer by counting how many learning blocks we've passed so far.
*/
function getLearningIndexForCurrentBlock() {
  let idx = state.currentBlockIdx;
  if (idx >= state.blocks.length) return null;
  if (state.blocks[idx].blockType !== "learning") return null;

  // count how many learning blocks before idx
  let countBefore = 0;
  for (let i = 0; i < idx; i++) {
    if (state.blocks[i].blockType === "learning") {
      countBefore += 1;
    }
  }
  return countBefore;
}

/*
Show block intro text for ~1s so participant can rest / know phase changed.
For reversal we might say something subtle or just "Next block".
*/
async function showBlockIntro(block) {
  hideAllTaskElems();

  // message content
  // Block messages hidden per user request
  // let msg = "";
  // if (block.blockType === "learning") {
  //   msg = "Learning Block " + block.blockNumber;
  // } else {
  //   msg = "Reversal Block " + block.blockNumber;
  // }
  //
  // blockMsgEl.textContent = msg;
  // blockMsgEl.classList.remove("hidden");
  //
  // // short pause
  // await sleep(1000);
  //
  // blockMsgEl.classList.add("hidden");
}

/*
Run a single trial with PsychoPy-like timing.
Returns trialResult object:
{
  trial_type: "valid_win"/"valid_lose"/"invalid_win"/"invalid_lose",
  reward_received: 0/1,
  chosen_is_high: 0/1,
  chosen_img_index: int (0..3),
  left_image_idx: int,
  right_image_idx: int,
  left_right_flip: 0/1
}
Also logs /log_trial automatically.
*/
async function runSingleTrial(block, trialObj, trialNumber) {
  console.log(`  Trial ${trialNumber}: Left=${IMAGE_FILES[trialObj.leftImg]}, Right=${IMAGE_FILES[trialObj.rightImg]}, PairType=${trialObj.pair_type}`);
  hideAllTaskElems();

  // 1. Fixation
  const fixationStart = performance.now();
  const fixationStartTimestamp = getTimestamp();
  fixationImgEl.classList.remove("hidden");
  await sleep(T_FIXATION);
  fixationImgEl.classList.add("hidden");
  const fixationEnd = performance.now();
  const fixationEndTimestamp = getTimestamp();
  const fixationDuration = (fixationEnd - fixationStart) / 1000; // convert to seconds

  // 2. Show choice images, wait for participant click
  // Preload both images first to ensure simultaneous display
  const leftSrc = "/images/" + IMAGE_FILES[trialObj.leftImg];
  const rightSrc = "/images/" + IMAGE_FILES[trialObj.rightImg];
  
  // Set sources but keep hidden
  leftImgEl.src = leftSrc;
  rightImgEl.src = rightSrc;
  
  // Wait for both images to load before displaying
  await Promise.all([
    new Promise((resolve) => {
      if (leftImgEl.complete) {
        resolve();
      } else {
        leftImgEl.onload = resolve;
      }
    }),
    new Promise((resolve) => {
      if (rightImgEl.complete) {
        resolve();
      } else {
        rightImgEl.onload = resolve;
      }
    })
  ]);
  
  // Now reveal both images simultaneously
  const stimulusStart = performance.now();
  const stimulusStartTimestamp = getTimestamp();
  leftImgEl.classList.remove("hidden");
  rightImgEl.classList.remove("hidden");

  // enable click
  leftImgEl.style.pointerEvents = "auto";
  rightImgEl.style.pointerEvents = "auto";
  
  // Record trial start time
  const trialStartTime = performance.now();
  const trialStartTimestamp = getTimestamp();

  const clickResult = await waitForChoice(trialObj, trialStartTime);

  // clickResult = { chosenSide: "left"/"right", chosenIdx, otherIdx }
  // We'll "dim" chosen for 400ms
  if (clickResult.chosenSide === "left") {
    leftImgEl.classList.add("dimmed");
  } else {
    rightImgEl.classList.add("dimmed");
  }

  // keep both images visible w/ chosen dimmed 400ms
  await sleep(T_POST_CHOICE);

  // 3. Hide both choice imgs
  leftImgEl.classList.add("hidden");
  rightImgEl.classList.add("hidden");
  const stimulusEnd = performance.now();
  const stimulusEndTimestamp = getTimestamp();
  const stimulusDuration = (stimulusEnd - stimulusStart) / 1000; // convert to seconds

  // 4. Feedback: decide correct / incorrect with mislead prob
  const outcome = computeFeedbackOutcome(block, trialObj, clickResult);

  // outcome = {
  //   trial_type: "valid_win"/...,
  //   reward_received: 0/1,
  //   chosen_is_high: 0/1
  // }

  console.log(`    Chose: ${IMAGE_FILES[clickResult.chosenIdx]}, Type: ${outcome.trial_type}, Reward: ${outcome.reward_received}, RT: ${clickResult.reactionTime.toFixed(3)}s`);

  // update score if win
  if (outcome.reward_received === 1) {
    state.score += 1;
    scoreValEl.textContent = state.score;
    debugScoreEl.textContent = state.score;
  }

  // show only feedback result image (smiley and amount)
  const feedbackStart = performance.now();
  const feedbackStartTimestamp = getTimestamp();
  const feedbackResultFile = outcome.reward_received === 1 ? "correct.png" : "incorrect.png";
  feedbackResultImgEl.src = "/images/" + feedbackResultFile;
  feedbackTextImgEl.classList.add("hidden"); // hide the gotme text image
  feedbackContainerEl.classList.remove("hidden");

  await sleep(T_FEEDBACK);

  feedbackContainerEl.classList.add("hidden");
  feedbackTextImgEl.classList.remove("hidden"); // restore for next time
  const feedbackEnd = performance.now();
  const feedbackEndTimestamp = getTimestamp();
  const feedbackDuration = (feedbackEnd - feedbackStart) / 1000; // convert to seconds

  // 5. Log trial
  // build trial payload for Google Sheets
  // We also generate one-hot for which image was chosen
  let selImg1 = 0, selImg2 = 0, selImg3 = 0, selImg4 = 0;
  if (clickResult.chosenIdx === 0) selImg1 = 1;
  if (clickResult.chosenIdx === 1) selImg2 = 1;
  if (clickResult.chosenIdx === 2) selImg3 = 1;
  if (clickResult.chosenIdx === 3) selImg4 = 1;

  // Store trial duration for summary statistics
  state.allTrialDurations.push(clickResult.reactionTime);
  if (block.blockType === "learning") {
    state.learningTrialDurations.push(clickResult.reactionTime);
  } else {
    state.reversalTrialDurations.push(clickResult.reactionTime);
  }
  
  // Store phase durations for task-level statistics
  state.allReactionDurations.push(clickResult.reactionTime);
  state.allFixationDurations.push(fixationDuration);
  state.allStimulusDurations.push(stimulusDuration);
  state.allFeedbackDurations.push(feedbackDuration);
  if (block.blockType === "learning") {
    state.learningReactionDurations.push(clickResult.reactionTime);
    state.learningFixationDurations.push(fixationDuration);
    state.learningStimulusDurations.push(stimulusDuration);
    state.learningFeedbackDurations.push(feedbackDuration);
  } else {
    state.reversalReactionDurations.push(clickResult.reactionTime);
    state.reversalFixationDurations.push(fixationDuration);
    state.reversalStimulusDurations.push(stimulusDuration);
    state.reversalFeedbackDurations.push(feedbackDuration);
  }

  // Determine selected_side and correct_side
  const selectedSide = clickResult.chosenSide; // "left" or "right"
  const correctSide = block.highSet.includes(trialObj.leftImg) ? "left" : "right";
  
  // Split timestamps into date and time, but only keep time fields
  const fixationStartSplit = splitTimestamp(fixationStartTimestamp);
  const fixationEndSplit = splitTimestamp(fixationEndTimestamp);
  const stimulusStartSplit = splitTimestamp(stimulusStartTimestamp);
  const stimulusEndSplit = splitTimestamp(stimulusEndTimestamp);
  const feedbackStartSplit = splitTimestamp(feedbackStartTimestamp);
  const feedbackEndSplit = splitTimestamp(feedbackEndTimestamp);
  
  // trial_type as required
  const trialPayload = {
    sub_id: state.subId,
    timestamp: getTimestamp(),
    trial_start: trialStartTimestamp,
    trial_duration: clickResult.reactionTime,
    block_number: block.blockNumber,
    block_type: block.blockType,
    trial_number: trialNumber,
    pair_type: trialObj.pair_type,
    trial_type: outcome.trial_type,
    valid_win:      outcome.trial_type === "valid_win"      ? 1 : 0,
    valid_lose:     outcome.trial_type === "valid_lose"     ? 1 : 0,
    invalid_win:    outcome.trial_type === "invalid_win"    ? 1 : 0,
    invalid_lose:   outcome.trial_type === "invalid_lose"   ? 1 : 0,
    sel_img1: selImg1,
    sel_img2: selImg2,
    sel_img3: selImg3,
    sel_img4: selImg4,
    left_image: IMAGE_FILES[trialObj.leftImg],
    right_image: IMAGE_FILES[trialObj.rightImg],
    left_right_flip: trialObj.flipLR,
    reward_received: outcome.reward_received,
    selected_side: selectedSide,
    correct_side: correctSide,
    fixation_start_time: fixationStartSplit.time,
    fixation_end_time: fixationEndSplit.time,
    fixation_duration: fixationDuration,
    stimulus_start_time: stimulusStartSplit.time,
    stimulus_end_time: stimulusEndSplit.time,
    stimulus_duration: stimulusDuration,
    feedback_start_time: feedbackStartSplit.time,
    feedback_end_time: feedbackEndSplit.time,
    feedback_duration: feedbackDuration
  };

  // Store trial payload to send in bulk after block
  // (will be sent after estimation phase)
  
  // Determine selected_side for return
  const selectedSideReturn = clickResult.chosenSide;
  
  // Return details needed to update learning criterion and trial payload
  return {
    trial_type: outcome.trial_type,
    reward_received: outcome.reward_received,
    chosen_is_high: outcome.chosen_is_high,
    chosen_img_index: clickResult.chosenIdx,
    left_image_idx: trialObj.leftImg,
    right_image_idx: trialObj.rightImg,
    left_right_flip: trialObj.flipLR,
    trial_duration: clickResult.reactionTime,
    selected_side: selectedSideReturn,
    trialPayload: trialPayload, // Include payload for bulk sending
    fixation_duration: fixationDuration,
    stimulus_duration: stimulusDuration,
    feedback_duration: feedbackDuration
  };
}

/*
Wait for the participant to click left or right image.
Resolve with { chosenSide, chosenIdx } where chosenIdx is the IMAGE_FILES index.
*/
function waitForChoice(trialObj, startTime) {
  return new Promise(resolve => {
    function handleLeft() {
      const endTime = performance.now();
      leftImgEl.style.pointerEvents = "none";
      rightImgEl.style.pointerEvents = "none";
      cleanup();
      resolve({
        chosenSide: "left",
        chosenIdx: trialObj.leftImg,
        otherIdx: trialObj.rightImg,
        reactionTime: (endTime - startTime) / 1000 // convert to seconds
      });
    }
    function handleRight() {
      const endTime = performance.now();
      leftImgEl.style.pointerEvents = "none";
      rightImgEl.style.pointerEvents = "none";
      cleanup();
      resolve({
        chosenSide: "right",
        chosenIdx: trialObj.rightImg,
        otherIdx: trialObj.leftImg,
        reactionTime: (endTime - startTime) / 1000 // convert to seconds
      });
    }
    function cleanup() {
      leftImgEl.removeEventListener("click", handleLeft);
      rightImgEl.removeEventListener("click", handleRight);
    }

    leftImgEl.addEventListener("click", handleLeft);
    rightImgEl.addEventListener("click", handleRight);
  });
}

/*
Given clickResult and trialObj, compute whether trial was
valid_win, valid_lose, invalid_win, invalid_lose.
Return { trial_type, reward_received, chosen_is_high }.
*/
function computeFeedbackOutcome(block, trialObj, clickResult) {
  const chosenIdx = clickResult.chosenIdx;
  const highSet = block.highSet; // 2 images considered "correct"

  const chosenIsHigh = highSet.includes(chosenIdx) ? 1 : 0;

  // Use predetermined misleading flag from trial object
  const misleading = trialObj.misleading || 0;

  let trial_type = "";
  let reward_received = 0;

  if (chosenIsHigh) {
    // Usually win
    if (misleading === 1) {
      // invalid_lose
      trial_type = "invalid_lose";
      reward_received = 0;
    } else {
      // valid_win
      trial_type = "valid_win";
      reward_received = 1;
    }
  } else {
    // Usually lose
    if (misleading === 1) {
      // invalid_win
      trial_type = "invalid_win";
      reward_received = 1;
    } else {
      // valid_lose
      trial_type = "valid_lose";
      reward_received = 0;
    }
  }

  return {
    trial_type,
    reward_received,
    chosen_is_high: chosenIsHigh
  };
}

/*
Get per-image reward probabilities for the current block:
For the 2 "high" imgs => 0.75
For the 2 "low" imgs  => 0.25
Return array [p_img1, p_img2, p_img3, p_img4] in SAME ORDER as IMAGE_FILES.
*/
function getProbabilitiesForImages(highSet) {
  let probs = [0,0,0,0];
  for (let i=0; i<4; i++) {
    probs[i] = highSet.includes(i) ? 0.8 : 0.2;
  }
  return probs;
}

/*
Build task payload for logging to TaskData sheet.
Called after each block (isFinished=false) and at end of experiment (isFinished=true).
*/
function buildTaskPayload(isFinished) {
  // figure out actual blocks that RAN
  // Because we might skip learning block #4.
  let learningCount = 0;
  let reversalCount = 0;
  let totalBlocksRun = 0;

  let fourthLearningBlockPresent = 0;

  let learningSoFar = 0;
  for (let b = 0; b < state.blocks.length; b++) {
    const block = state.blocks[b];
    // Only count blocks that have been run (have summary data with n_trials)
    if (!block.summary || !block.summary.n_trials) continue;
    
    if (block.blockType === "learning") {
      if (learningSoFar === 3 && state.skipFourthLearning) {
        // this is the 4th learning block but skipped
        // do not count
      } else {
        learningCount += 1;
        totalBlocksRun += 1;
        if (learningSoFar === 3 && !state.skipFourthLearning) {
          fourthLearningBlockPresent = 1;
        }
      }
      learningSoFar += 1;
    } else {
      // reversal
      reversalCount += 1;
      totalBlocksRun += 1;
    }
  }

  // highest_reward_block:
  let highestBlock = null;
  let bestReward = -1;
  Object.keys(state.blockRewardCounts).forEach(bnumStr => {
    const bnum = parseFloat(bnumStr);
    const val = state.blockRewardCounts[bnumStr];
    if (val > bestReward) {
      bestReward = val;
      highestBlock = bnum;
    }
  });

  // learner_status: 1 if skipFourthLearning==true (fast learner), 0 otherwise
  const learnerStatus = state.skipFourthLearning ? 1 : 0;

  // Calculate duration statistics
  const learningReactionStats = calculateStats(state.learningReactionDurations);
  const reversalReactionStats = calculateStats(state.reversalReactionDurations);
  const totalReactionStats = calculateStats(state.allReactionDurations);
  
  const learningFixationStats = calculateStats(state.learningFixationDurations);
  const reversalFixationStats = calculateStats(state.reversalFixationDurations);
  const totalFixationStats = calculateStats(state.allFixationDurations);
  
  const learningStimulusStats = calculateStats(state.learningStimulusDurations);
  const reversalStimulusStats = calculateStats(state.reversalStimulusDurations);
  const totalStimulusStats = calculateStats(state.allStimulusDurations);
  
  const learningFeedbackStats = calculateStats(state.learningFeedbackDurations);
  const reversalFeedbackStats = calculateStats(state.reversalFeedbackDurations);
  const totalFeedbackStats = calculateStats(state.allFeedbackDurations);
  
  // Calculate overall left selection percentage
  const totalTaskSelections = state.totalLeftSelections + state.totalRightSelections;
  const taskLeftPercent = totalTaskSelections > 0 ? (state.totalLeftSelections / totalTaskSelections) * 100 : 0;

  return {
    sub_id: state.subId,
    timestamp: getTimestamp(),
    total_blocks: totalBlocksRun,
    learning_blocks: learningCount,
    reversal_blocks: reversalCount,
    highest_reward_block: highestBlock,
    learner_status: learnerStatus,
    total_rewards: state.score,
    learning_rewards: state.totalRewardsLearning,
    reversal_rewards: state.totalRewardsReversal,
    fourth_learning_block_present: fourthLearningBlockPresent,
    avg_reaction_duration_learning: learningReactionStats.mean,
    std_reaction_duration_learning: learningReactionStats.std,
    avg_reaction_duration_reversal: reversalReactionStats.mean,
    std_reaction_duration_reversal: reversalReactionStats.std,
    avg_reaction_duration_total: totalReactionStats.mean,
    std_reaction_duration_total: totalReactionStats.std,
    avg_fixation_duration_learning: learningFixationStats.mean,
    std_fixation_duration_learning: learningFixationStats.std,
    avg_fixation_duration_reversal: reversalFixationStats.mean,
    std_fixation_duration_reversal: reversalFixationStats.std,
    avg_fixation_duration_total: totalFixationStats.mean,
    std_fixation_duration_total: totalFixationStats.std,
    avg_stimulus_duration_learning: learningStimulusStats.mean,
    std_stimulus_duration_learning: learningStimulusStats.std,
    avg_stimulus_duration_reversal: reversalStimulusStats.mean,
    std_stimulus_duration_reversal: reversalStimulusStats.std,
    avg_stimulus_duration_total: totalStimulusStats.mean,
    std_stimulus_duration_total: totalStimulusStats.std,
    avg_feedback_duration_learning: learningFeedbackStats.mean,
    std_feedback_duration_learning: learningFeedbackStats.std,
    avg_feedback_duration_reversal: reversalFeedbackStats.mean,
    std_feedback_duration_reversal: reversalFeedbackStats.std,
    avg_feedback_duration_total: totalFeedbackStats.mean,
    std_feedback_duration_total: totalFeedbackStats.std,
    selected_left_count: state.totalLeftSelections,
    selected_right_count: state.totalRightSelections,
    selected_left_percent: taskLeftPercent,
    version: state.version,
    isFinished: isFinished ? 1 : 0
  };
}

/*
At end of ALL blocks:
 - compute summary stats
 - log /log_task
 - show thank you screen
*/
async function endExperiment() {
  console.log("\n=== Ending Experiment ===");
  
  // Send final task data with isFinished = true
  const taskPayload = buildTaskPayload(true);
  console.log("Task summary:");
  console.log("  Total blocks run:", taskPayload.total_blocks);
  console.log("  Learning blocks:", taskPayload.learning_blocks);
  console.log("  Reversal blocks:", taskPayload.reversal_blocks);
  console.log("  Total score:", taskPayload.total_rewards);
  console.log("  Learner status:", taskPayload.learner_status);
  
  await logTaskData(taskPayload);

  console.log("=== Experiment Complete ===");
  
  // Show end / thank-you
  finalScoreEl.textContent = state.score;
  showScreen(endScreenEl);
}

/* =======================
   INSTRUCTIONS FLOW
   ======================= */

let instrIndex = 0;

function startInstructions() {
  instrIndex = 0;
  showScreen(instrScreenEl);
  showInstructionSlide();
}

function showInstructionSlide() {
  // show current instruction image
  const imgName = INSTR_IMAGES[instrIndex];
  instrImageEl.src = "/images/" + imgName;

  // If we're on the last slide, button will say "Start Task"
  if (instrIndex === INSTR_IMAGES.length - 1) {
    nextInstrBtn.textContent = "Start Task";
  } else {
    nextInstrBtn.textContent = "Next";
  }
}

nextInstrBtn.addEventListener("click", () => {
  if (instrIndex < INSTR_IMAGES.length - 1) {
    instrIndex += 1;
    showInstructionSlide();
  } else {
    // done instructions => start experiment
    showScreen(taskScreenEl);
    runExperiment();
  }
});


/* =======================
   START SCREEN HANDLER
   ======================= */

startBtn.addEventListener("click", () => {
  const pid = partIdInput.value.trim();
  const ver = 1; // Default to version 1

  if (!pid) {
    alert("Please enter Participant ID first.");
    return;
  }

  // init state
  state.subId = pid;
  // Randomly select version (1-4)
  state.version = Math.floor(Math.random() * 4) + 1;
  state.score = 0;
  scoreValEl.textContent = "0";

  state.blocks = buildExperimentBlocks(state.version);
  state.currentBlockIdx = 0;
  state.currentTrialIdx = 0;
  state.skipFourthLearning = false;
  state.totalRewardsLearning = 0;
  state.totalRewardsReversal = 0;
  state.blockRewardCounts = {};
  state.allTrialDurations = [];
  state.learningTrialDurations = [];
  state.reversalTrialDurations = [];
  state.allReactionDurations = [];
  state.learningReactionDurations = [];
  state.reversalReactionDurations = [];
  state.allFixationDurations = [];
  state.learningFixationDurations = [];
  state.reversalFixationDurations = [];
  state.allStimulusDurations = [];
  state.learningStimulusDurations = [];
  state.reversalStimulusDurations = [];
  state.allFeedbackDurations = [];
  state.learningFeedbackDurations = [];
  state.reversalFeedbackDurations = [];
  state.totalLeftSelections = 0;
  state.totalRightSelections = 0;

  // move to phone flip screen
  showScreen(phoneFlipScreenEl);
});

/* =======================
   PHONE FLIP SCREEN HANDLER
   ======================= */

// flipConfirmBtn.addEventListener("click", () => {
//   // move to mobile instructions screen
//   showScreen(mobileInstructionsScreenEl);
// });


flipConfirmBtn.addEventListener("click", () => {
  // move to instructions
  startInstructions();
});


/* =======================
   MOBILE INSTRUCTIONS SCREEN HANDLER
   ======================= */

// mobileInstructionsBtn.addEventListener("click", () => {
//   // move to instructions
//   startInstructions();
// });


/* =======================
   CONFIDENCE SLIDER EVENT LISTENERS
   ======================= */

// Slider event listeners removed - no value display needed


/************************************************************
 * That's it.
 * After participant enters ID & version, we:
 *   - show instructions slides
 *   - runExperiment() which handles blocks/trials/logging
 *   - log to Google Sheets through Flask (/log_trial, /log_block, /log_task)
 *   - after each block, show confidence rating screen for all 4 images
 ************************************************************/