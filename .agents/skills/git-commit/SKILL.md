---
name: git-commit
description: Triggered by '/git-commit', '/action git-commit', or requests to update README.md with detailed user questions and verification results, then commit and push to GitHub.
---

# README 자동 업데이트 & Git 커밋/푸시 스킬 (`git-commit`)

`/git-commit`, `/action git-commit` 명령이나 README 업데이트 및 Git 푸시 요청을 수신했을 때 실행되는 스킬입니다.

## 주요 기능 및 수행 절차 (Workflow)

1. **사용자 요청 및 변경 사항 분석**:
   - 대화 내역의 사용자 요청 배경, 해결된 문제, 구현된 기능을 종합 정리합니다.
   - 실제 변경된 코드, 설정 파일 및 문서 내역을 검토합니다.

2. **README.md 문서 업데이트**:
   - 변경 사항 및 새로 추가되거나 검증된 기능 내역을 프로젝트의 [`README.md`](file:///c:/Users/user/Desktop/web%20app/ai-tutor-app-main/README.md)에 상세하고 체계적으로 반영합니다.

3. **상세 Git 커밋 메시지 작성**:
   - 요청 내용과 작업/검증 결과를 포함한 상세 커밋 메시지를 구성합니다.
   - **커밋 메시지 양식 예시**:
     ```text
     docs: update README.md and detailed commit results

     [User Request]
     - 사용자의 질의 및 요청 사항 요약

     [Action & Verification Results]
     - 수정한 파일 및 구현/수정 내역 상세
     - 구문 검사, 실행 검증, 빌드/타입체크 결과

     [Summary]
     - 최종 작업 결과 및 동기화 상태
     ```

4. **Git Staging, Commit & Push**:
   - `git add .`
   - 상세 메시지로 `git commit -m "..."`
   - `git push origin main` (또는 현재 작업 브랜치)

5. **결과 보고**:
   - 최종 커밋 해시, README 반영 사항, 푸시 결과를 사용자에게 종합 보고합니다.

