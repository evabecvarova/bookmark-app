---
name: Code Reviewer
description: Reviews code for bugs, style, and best practices
instructions: Use this skill when reviewing pull requests or code changes
---
# Code Review Rules

## General
- Ensure code is readable and consistent.
- Avoid unnecessary comments.
- Prefer functional components where applicable.

## Style
- Use const/let instead of var.
- Use strict equality (===) instead of ==.
- Use descriptive variable and function names.

## Testing
- Write tests first when possible.
- Ensure all new code has test coverage.

## Security
- Validate all external data.
- Avoid unsafe regex patterns.
- Check for SQL injection in user inputs.

## Error Handling
- Guard against null/undefined before accessing properties.
- Ensure functions return explicit values.
