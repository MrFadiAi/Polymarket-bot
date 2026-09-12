```markdown
# Polymarket-bot Development Patterns

> Auto-generated skill from repository analysis

## Overview
This skill teaches the core development patterns and conventions used in the `Polymarket-bot` TypeScript codebase. It covers file organization, code style, commit practices, and testing approaches to ensure consistency and maintainability. While no explicit frameworks or automation workflows are detected, this guide provides best practices for contributing and maintaining code in this repository.

## Coding Conventions

### File Naming
- **Style:** kebab-case
- **Example:**  
  ```
  market-handler.ts
  trade-utils.ts
  ```

### Import Style
- **Style:** Relative imports
- **Example:**
  ```typescript
  import { getMarketData } from './market-utils';
  ```

### Export Style
- **Style:** Named exports
- **Example:**
  ```typescript
  // In trade-utils.ts
  export function executeTrade() { ... }
  export const TRADE_LIMIT = 100;
  ```

### Commit Messages
- **Style:** Conventional commits
- **Prefix:** `feat`
- **Example:**
  ```
  feat: add support for multi-market queries in trade executor
  ```

## Workflows

### Adding a New Feature
**Trigger:** When implementing a new capability or functionality  
**Command:** `/add-feature`

1. Create a new TypeScript file using kebab-case (e.g., `new-feature.ts`).
2. Use relative imports to include dependencies.
3. Export functions or constants using named exports.
4. Write or update tests in a corresponding `*.test.*` file.
5. Commit using the conventional commit style:
   ```
   feat: short description of the new feature
   ```
6. Push your changes and open a pull request.

### Writing Tests
**Trigger:** When adding or updating code that requires validation  
**Command:** `/write-test`

1. Create or update a test file matching the pattern `*.test.*` (e.g., `market-handler.test.ts`).
2. Write tests for each exported function or feature.
3. Run the test suite using your preferred TypeScript test runner.
4. Ensure all tests pass before committing.

## Testing Patterns

- **Test File Pattern:** Files should be named with the pattern `*.test.*` (e.g., `trade-utils.test.ts`).
- **Framework:** Not explicitly detected; use your preferred TypeScript-compatible test framework (e.g., Jest, Mocha).
- **Example:**
  ```typescript
  import { executeTrade } from './trade-utils';

  describe('executeTrade', () => {
    it('should execute a trade successfully', () => {
      // Test implementation
    });
  });
  ```

## Commands
| Command        | Purpose                                         |
|----------------|-------------------------------------------------|
| /add-feature   | Start the process for adding a new feature      |
| /write-test    | Begin writing or updating tests for your code   |
```
