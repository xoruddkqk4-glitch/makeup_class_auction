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
- 커밋 메시지는 한국어로 작성하며, `docs: update README.md and detailed commit results` 포맷을 따릅니다.
