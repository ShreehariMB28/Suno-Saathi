# My Contribution – Voice Distress Detection

## Project Title
**Non-Verbal Distress Detection via Voice Pattern Analysis**

## Contribution Overview

My contribution focuses on the **voice-based distress detection module** of the project.

The module analyzes recorded voice audio and generates a **Distress Risk Score (0–100)** based on detected vocal stress characteristics. The purpose is to identify possible distress even when the user does not speak a predefined codeword.

---

## My Module

The implemented flow is:

Audio Recording  
↓  
Voice Distress Analysis  
↓  
Distress Risk Score  
↓  
Emergency Decision  
↓  
Existing Emergency Alert System

The existing codeword detection and emergency notification systems are kept separate and reused.

---

## Voice Distress Analysis

The recorded audio is passed to the Python-based voice analysis service.

The analysis produces a normalized score between **0 and 100**.

Example:

```text
Audio Recording
      ↓
Voice Stress Analysis
      ↓
Distress Score: 82/100
      ↓
Status: High Distress

## 15-Second Auto-Dispatch Safety Mechanism

The system includes a 15-second safety mechanism for cases where **Auto Dispatch is turned OFF**.

When the system detects a high distress condition (Distress Score ≥ 70):

1. If **Auto Dispatch is ON**, the existing emergency alert procedure is triggered immediately.

2. If **Auto Dispatch is OFF**, the system displays a distress reminder asking the user to enable Auto Dispatch.

3. A **15-second countdown** starts.

4. If the user enables Auto Dispatch within 15 seconds, the normal emergency alert procedure is triggered.

5. If the user does not respond or does not enable Auto Dispatch within 15 seconds, the system automatically proceeds with the normal emergency alert procedure.

6. The system prevents duplicate alerts if the user enables Auto Dispatch while the countdown is still running.

### Flow

```text
Distress Score >= 70
        ↓
Auto Dispatch ON?
     /       \
   YES        NO
    ↓          ↓
Emergency    Reminder
Alert          ↓
          15 Second Timer
                ↓
       Auto Dispatch Enabled?
          /             \
        YES              NO
         ↓                ↓
   Emergency Alert   Emergency Alert