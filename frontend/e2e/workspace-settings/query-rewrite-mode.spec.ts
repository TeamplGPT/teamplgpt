import { test, expect } from '@playwright/test';
import { timeouts } from '../fixtures/test-data';

/**
 * Query Rewrite Mode 설정 E2E 테스트
 *
 * 워크스페이스 설정 > Vector Database 탭에서
 * Query Rewrite Mode select 드롭다운의 렌더링, 인터랙션, 저장을 검증합니다.
 *
 * 사전 조건: 워크스페이스가 1개 이상 존재해야 합니다.
 */

test.describe('Query Rewrite Mode 설정', () => {
  let workspaceSlug: string;

  test.beforeEach(async ({ page }) => {
    // 메인 페이지 → 로그인 처리
    await page.goto('/');
    await page.waitForLoadState('networkidle', { timeout: timeouts.navigation });

    const passwordInput = page.locator('input[name="password"]');
    const hasPassword = (await passwordInput.count()) > 0;

    if (hasPassword) {
      await passwordInput.fill(
        process.env.E2E_SINGLE_USER_PASSWORD || 'password'
      );
      await page.locator('button[type="submit"]').click();
      await page.waitForURL('/', { timeout: timeouts.navigation });
    }

    // 첫 번째 워크스페이스 slug 획득
    const url = page.url();
    const match = url.match(/\/workspace\/([^/]+)/);
    workspaceSlug = match ? match[1] : 'test-workspace';

    // 워크스페이스 설정 > Vector Database 탭으로 이동
    await page.goto(`/workspace/${workspaceSlug}/settings/vector-database`);
    await page.waitForLoadState('networkidle', { timeout: timeouts.navigation });
  });

  // ─── 렌더링 검증 ────────────────────────────────────────

  test('Vector Database 탭에 Query Rewrite Mode 라벨이 표시된다', async ({
    page,
  }) => {
    const label = page.locator('text=Query Rewrite Mode');
    await expect(label).toBeVisible({ timeout: timeouts.long });
  });

  test('Query Rewrite Mode select에 3개 옵션이 존재한다', async ({
    page,
  }) => {
    const select = page.locator('select[name="queryRewriteMode"]');
    await expect(select).toBeVisible({ timeout: timeouts.long });

    const options = select.locator('option');
    await expect(options).toHaveCount(3);

    // 각 옵션 value 확인
    await expect(options.nth(0)).toHaveAttribute('value', 'off');
    await expect(options.nth(1)).toHaveAttribute('value', 'rule');
    await expect(options.nth(2)).toHaveAttribute('value', 'llm');
  });

  test('기본값이 Off로 선택되어 있다', async ({ page }) => {
    const select = page.locator('select[name="queryRewriteMode"]');
    await expect(select).toBeVisible({ timeout: timeouts.long });
    await expect(select).toHaveValue('off');
  });

  // ─── 인터랙션 검증 ──────────────────────────────────────

  test('모드 변경 시 힌트 텍스트가 업데이트된다', async ({ page }) => {
    const select = page.locator('select[name="queryRewriteMode"]');
    await expect(select).toBeVisible({ timeout: timeouts.long });

    // Rule-based 선택
    await select.selectOption('rule');
    await expect(
      page.locator('text=동의어 확장, 불용어 제거')
    ).toBeVisible();

    // LLM-enhanced 선택
    await select.selectOption('llm');
    await expect(
      page.locator('text=추가 LLM 호출이 발생합니다')
    ).toBeVisible();

    // Off로 되돌리기
    await select.selectOption('off');
    await expect(
      page.locator('text=원문 그대로 벡터 검색에 사용합니다')
    ).toBeVisible();
  });

  test('모드 변경 시 Update Workspace 버튼이 나타난다', async ({ page }) => {
    const select = page.locator('select[name="queryRewriteMode"]');
    await expect(select).toBeVisible({ timeout: timeouts.long });

    // 변경 전에는 버튼이 없을 수 있음
    await select.selectOption('rule');

    const updateBtn = page.locator('button:has-text("Update Workspace")');
    await expect(updateBtn).toBeVisible({ timeout: timeouts.medium });
  });

  // ─── 저장 및 영속성 검증 ─────────────────────────────────

  test('모드를 변경하고 저장하면 새로고침 후에도 유지된다', async ({
    page,
  }) => {
    const select = page.locator('select[name="queryRewriteMode"]');
    await expect(select).toBeVisible({ timeout: timeouts.long });

    // rule로 변경
    await select.selectOption('rule');

    // Update Workspace 클릭
    const updateBtn = page.locator('button:has-text("Update Workspace")');
    await expect(updateBtn).toBeVisible({ timeout: timeouts.medium });
    await updateBtn.click();

    // 성공 토스트 대기
    await expect(
      page.locator('text=Workspace updated!').first()
    ).toBeVisible({ timeout: timeouts.long });

    // 페이지 새로고침
    await page.reload();
    await page.waitForLoadState('networkidle', { timeout: timeouts.navigation });

    // 저장된 값 확인
    const selectAfterReload = page.locator('select[name="queryRewriteMode"]');
    await expect(selectAfterReload).toHaveValue('rule', {
      timeout: timeouts.long,
    });

    // 원래 값으로 복원 (테스트 후 정리)
    await selectAfterReload.selectOption('off');
    const restoreBtn = page.locator('button:has-text("Update Workspace")');
    await expect(restoreBtn).toBeVisible({ timeout: timeouts.medium });
    await restoreBtn.click();
    await expect(
      page.locator('text=Workspace updated!').first()
    ).toBeVisible({ timeout: timeouts.long });
  });
});
