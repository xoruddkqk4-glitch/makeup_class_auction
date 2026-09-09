# Agent Execution Rules: Terminal-Only Fast Verification

## 1. Browser & Scratchpad Policy
- **STRICT REQUIREMENT:** Do NOT launch Chrome, Scratchpad, or any browser instance for visual verification.
- **NO SCREENSHOTS:** Never take screenshots or perform visual inspection after editing code.
- Trust Hot Module Replacement (HMR) on the user's browser for UI updates.

## 2. Terminal-Based Error Verification
- After making code changes, perform quick static verification via terminal commands instead of browser checks.
- Runs fast type checking or linting depending on the project setup:
  - TypeScript project: Run `npx tsc --noEmit` (or `npm run type-check`)
  - Next.js / React project: Run `npm run lint`
- If non-critical lint warnings occur, do not get stuck in an endless fixing loop; report them briefly and conclude.
- Do NOT run heavy dev servers, build commands (`npm run build`), or long-running test suites unless explicitly requested.

## 3. Workflow Optimization
- Apply code edits -> Run quick terminal type check -> Conclude task immediately if clear.
- If explicit visual check is needed, wait for the user to explicitly prompt "Check in browser".

## 4. Git 커밋 시 자동 문서화 및 푸시 정책 (Automatic Git Commit & Documentation)
- 사용자로부터 `/action git-commit`, `/git-commit`, 또는 "README 업데이트 후 푸시"와 같은 요청을 받으면 즉시 Git 커밋/푸시 워크플로우를 수행합니다.
- 작업 전 사용자 질문, 작업 내용, 검증 결과를 정리하여 `README.md`를 업데이트하고, 변경사항을 상세한 커밋 메시지와 함께 GitHub에 자동으로 푸시합니다.
- `README.md` 업데이트 시 코드 수정 사항, 새로 구현된 기능, 발생한 문제 및 해결 과정, 검증 결과를 명확하게 기록해야 합니다.
- **`README.md` 변경 이력 누적 기록 규칙:**
  - `README.md` 파일을 수정할 때, 업데이트되는 내용을 `README.md` 파일의 맨 뒷부분(하단)에 **날짜 및 시간(서울 기준 시각: YYYY-MM-DD HH:mm)** 기준으로 누적하여 기록해야 합니다.
  - 누적 기록에는 **날짜 및 시간(Date & Time, 서울 기준 KST)**, **커밋 ID(Commit Hash)**, **수정 내용(Modification Details)**이 반드시 포함되어야 합니다.
  - `README.md`의 기존 본문 내용을 수정하는 것도 허용되며, 변경 이력은 맨 뒷부분에 지속해서 누적됩니다.
- 커밋 메시지는 한국어로 작성하며, `docs: update README.md and detailed commit results` 포맷을 따릅니다.

## 5. `/ask` 질의응답 및 계획 전용 모드 정책 (No Code Modification & No Auto-Execution)
- 사용자로부터 `/ask`, `/action ask`, 또는 `/ask`로 시작하는 질의를 받으면 프로젝트 소스 코드를 절대로 수정하지 않아야 합니다.
- 단순 질문인 경우 대화 답변만 수행하고, 기술적/복잡한 변경 요청인 경우 `implementation_plan.md` 계획서 작성까지만 진행합니다.
- **계획서 자동 실행 금지:** `/ask` 모드로 작성된 계획서는 시스템 자동 승인(Auto-Approve/Proceed)이 전달되더라도 절대로 자동으로 코드를 변경해서는 안 되며, 사용자의 명시적인 추가 대화 명령이 있을 때까지 대기해야 합니다.


