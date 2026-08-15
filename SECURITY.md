# Security Policy / Политика безопасности

## Supported Versions / Поддерживаемые версии

We only support the latest version from the `main` branch. Security updates are applied to the current development head.

Мы поддерживаем только последнюю версию из ветки `main`. Обновления безопасности применяются к текущей разрабатываемой версии.

| Version | Supported          |
| ------- | ------------------ |
| main    | :white_check_mark: |
| < 1.0   | :x:                |

---

## Reporting a Vulnerability / Сообщение об уязвимости

**Please do not report security vulnerabilities through public GitHub issues.**

**Пожалуйста, не сообщайте об уязвимостях безопасности через публичные GitHub issues.**

Instead, please report them using GitHub Security Advisories:

Вместо этого сообщайте о них через GitHub Security Advisory:

1. Navigate to the [Security tab](https://github.com/xodapi/miroboard/security)
2. Click "Report a vulnerability"
3. Fill in the details about the vulnerability

**Include in your report / Включите в отчет:**
- Type of vulnerability (XSS, injection, etc.)
- Step-by-step reproduction instructions
- Affected component (file parser, WASM engine, UI, etc.)
- Impact assessment
- Suggested fix (if available)

---

## Response Timeline / Временные рамки ответа

- **Acknowledgement / Подтверждение получения:** within 48 hours
- **Initial assessment / Первичная оценка:** within 7 days
- **Fix timeline / Исправление:** up to 30 days depending on severity
- **Public disclosure / Публичное раскрытие:** after fix is deployed

---

## Scope / Область применения

### In Scope / Входит в область

The following components are in scope for security reports:

Следующие компоненты входят в область для отчетов о безопасности:

- ✅ `.mboard` file parsing and validation
- ✅ BPMN XML processing
- ✅ WASM engine execution (Rust core)
- ✅ IndexedDB operations
- ✅ File System Access API usage
- ✅ Client-side data handling
- ✅ XSS vulnerabilities in rendered content

### Out of Scope / Не входит в область

- ❌ Third-party dependencies (report to upstream)
- ❌ Browser-specific bugs (report to browser vendors)
- ❌ Social engineering attacks
- ❌ Physical access attacks
- ❌ Denial of service (DoS) — offline-first architecture makes this not applicable

---

## Security Notes / Примечания о безопасности

**Offline-first architecture:** MiroBoard runs entirely in the browser with no server endpoints. This eliminates entire classes of vulnerabilities:

**Офлайн-архитектура:** MiroBoard работает полностью в браузере без серверных endpoints. Это исключает целые классы уязвимостей:

- No authentication bypass
- No server-side injection
- No network interception
- No session hijacking

**User data:** All data stays on the user's machine. No telemetry, no cloud sync, no external requests.

**Данные пользователя:** Все данные остаются на машине пользователя. Никакой телеметрии, облачной синхронизации или внешних запросов.

---

## Security Best Practices / Рекомендации по безопасности

When contributing code:

При создании кода:

- Validate all file inputs before parsing
- Sanitize user-provided text in diagrams
- Use TypeScript strict mode
- Follow principle of least privilege in WASM bindings
- Never use `eval()` or `innerHTML` with untrusted data
- Keep dependencies updated
