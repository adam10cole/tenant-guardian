# Tenant Guardian

**EECS 497: Human-Centered Software Design and Development** — Project by Adam Cole, Aadil Parvaz, Brandon Ni, Christian Van, Thomas Lei.

## What It Is

Tenant Guardian is a mobile app that helps renters document housing issues, keep organized records of landlord communication, and build court-ready evidence. It focuses on users who may have low digital literacy, limited English, or need extra support—so the legal system can work for everyone.

## Goals

- **Short-term:** Accessible MVP with guided issue logging and PDF export. Documentation in ≤3 minutes.
- **Long-term:** Tenant-to-tenant sharing, landlord heatmaps/ratings, in-app legal chat, and an AI assistant for preemptive advice.

Success is measured by legal validity of output, task completion rate, engagement, and user satisfaction.

## Team & Roles

| Member        | Focus                          |
|---------------|---------------------------------|
| Adam Cole     | Backend, database, offline-first |
| Aadil Parvaz  | Mobile, camera, watermarking    |
| Brandon Ni    | Status logic, timers, dashboard |
| Christian Van | UI/UX, guided intake, accessibility |
| Thomas Lei    | PDF export, heatmap, DevOps     |

## Tech Stack

- **App:** Expo (React Native) with Expo Router
- **Styling:** NativeWind (Tailwind)
- **Backend / Auth / DB:** Supabase
- **State:** Zustand, TanStack Query

## Getting Started

1. **Clone and install**
   ```bash
   git clone https://github.com/adam10cole/tenant-guardian.git
   cd tenant-guardian
   npm install
   ```

2. **Environment**
   - Copy `.env.local.example` to `.env.local`
   - Set `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY` (from your Supabase project)

3. **Run**
   ```bash
   npm start        # Expo dev server
   npm run ios      # iOS simulator
   npm run android  # Android emulator
   ```

## Current Status (Lo-Fi Prototype)

- Guided documentation flow with issue types
- Camera capture for evidence
- Backend and frontend wired up
- Cloud sync across devices
- Issue timeline
- PDF export of issue reports
- Accessibility pass

## Course Artifacts

- **Project Planning Document** — Briefing, milestones, Gantt, literature & technology review
- **User Requirements Document** — Stakeholders, deliverables, prioritized requirements table
- **Lo-Fi Prototype** — Write-up and demo video (submitted on Canvas)

## License

MIT
