# Pull Request / Запрос на слияние

## Description / Описание

Please include a summary of the changes and the related issue. Explain the motivation and context.

Пожалуйста, включите краткое описание изменений и связанной проблемы. Объясните мотивацию и контекст.

## Type of change / Тип изменения

- [ ] Bug fix / Исправление ошибки (non-breaking change which fixes an issue)
- [ ] New feature / Новая функция (non-breaking change which adds functionality)
- [ ] Breaking change / Критическое изменение (fix or feature that would cause existing functionality to not work as expected)
- [ ] Documentation update / Обновление документации
- [ ] Performance improvement / Улучшение производительности
- [ ] Refactoring / Рефакторинг (no functional changes)
- [ ] Test coverage / Покрытие тестами

## Related issues / Связанные задачи

Fixes #(issue number)
Closes #(issue number)
Related to #(issue number)

## Checklist / Чеклист

**Code Quality / Качество кода:**
- [ ] TypeScript compiles without errors (`tsc --noEmit`)
- [ ] ESLint passes with no warnings (`npm run lint`)
- [ ] Code follows the project's style guidelines
- [ ] No console.log or debugging code left in

**Testing / Тестирование:**
- [ ] Tests added/updated for new functionality
- [ ] Vitest unit tests pass (148/148 expected) (`npm run test`)
- [ ] Playwright E2E tests pass (88/88 expected) (`npm run test:e2e`) — if UI changed
- [ ] Cargo tests pass (`cargo test`) — if Rust/WASM changed
- [ ] Manual testing performed

**Documentation / Документация:**
- [ ] CHANGELOG.md updated with changes
- [ ] Code comments added for complex logic
- [ ] README.md updated if needed
- [ ] JSDoc/TSDoc added for new public APIs

**BPMN Compliance (if applicable) / Соответствие BPMN (если применимо):**
- [ ] Changes align with BPMN 2.0 specification
- [ ] Visual changes maintain BPMN notation standards
- [ ] Simulation behavior is correct
- [ ] .mboard format compatibility maintained

**Breaking Changes (if applicable) / Критические изменения (если применимо):**
- [ ] Migration guide added
- [ ] Backward compatibility considered
- [ ] Version bump planned

## Screenshots / Скриншоты

If your changes include visual updates, please add before/after screenshots:

Если ваши изменения включают визуальные обновления, пожалуйста, добавьте скриншоты до/после:

**Before / До:**


**After / После:**


## Performance Impact / Влияние на производительность

If applicable, describe any performance implications:

Если применимо, опишите любые последствия для производительности:

- [ ] No performance impact
- [ ] Performance improved
- [ ] Performance regression (please explain and justify)

## Additional Notes / Дополнительные примечания

Add any other context about the pull request here.

Добавьте любой другой контекст о pull request здесь.

---

**Reviewer Notes / Заметки для ревьюера:**

Please pay special attention to:
- 
- 
