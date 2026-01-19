# Contributing to SentinelQA

Thank you for your interest in contributing to SentinelQA! This document provides guidelines and instructions for contributing.

## 📋 Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Getting Started](#getting-started)
- [Development Workflow](#development-workflow)
- [Coding Standards](#coding-standards)
- [Submitting Changes](#submitting-changes)
- [Issue Guidelines](#issue-guidelines)

---

## Code of Conduct

This project adheres to a [Code of Conduct](CODE_OF_CONDUCT.md). By participating, you are expected to uphold this code.

---

## Getting Started

### 1. Fork the Repository

Click the "Fork" button on GitHub to create your own copy of the repository.

### 2. Clone Your Fork

```bash
git clone https://github.com/YOUR_USERNAME/sentinelqa.git
cd sentinelqa
```

### 3. Set Up Upstream Remote

```bash
git remote add upstream https://github.com/original-org/sentinelqa.git
```

### 4. Install Dependencies

**Backend:**
```bash
cd backend
python -m venv venv
venv\Scripts\activate  # Windows
source venv/bin/activate  # macOS/Linux
pip install -r requirements.txt
pip install -r requirements-dev.txt  # Development dependencies
playwright install chromium
```

**Frontend:**
```bash
cd frontend
npm install
```

---

## Development Workflow

### 1. Create a Branch

Always create a new branch for your work:

```bash
git checkout -b feature/your-feature-name
# or
git checkout -b fix/issue-description
```

**Branch Naming Convention:**
- `feature/` - New features
- `fix/` - Bug fixes
- `docs/` - Documentation changes
- `refactor/` - Code refactoring
- `test/` - Test additions or fixes

### 2. Make Your Changes

- Write clean, readable code
- Add tests for new functionality
- Update documentation as needed

### 3. Test Your Changes

**Backend:**
```bash
cd backend
pytest
python -m flake8 .
```

**Frontend:**
```bash
cd frontend
npm test
npm run lint
```

### 4. Commit Your Changes

Write clear, descriptive commit messages:

```bash
git add .
git commit -m "feat: add AI verification for login flows"
```

**Commit Message Format:**
- `feat:` - New feature
- `fix:` - Bug fix
- `docs:` - Documentation
- `style:` - Formatting (no code change)
- `refactor:` - Code restructuring
- `test:` - Adding tests
- `chore:` - Maintenance

### 5. Push and Create PR

```bash
git push origin feature/your-feature-name
```

Then open a Pull Request on GitHub.

---

## Coding Standards

### Python (Backend)

- Follow PEP 8 style guide
- Use type hints for function parameters and return types
- Maximum line length: 100 characters
- Use docstrings for functions and classes

```python
async def process_test_run(
    run_id: str,
    instruction: str,
    timeout_ms: int = 30000
) -> Dict[str, Any]:
    """
    Process an AI-powered test run.
    
    Args:
        run_id: Unique identifier for the test run
        instruction: Natural language test instruction
        timeout_ms: Maximum execution time in milliseconds
        
    Returns:
        Dictionary containing test results and metadata
    """
    pass
```

### JavaScript/React (Frontend)

- Use functional components with hooks
- Use meaningful component and variable names
- Prefer destructuring
- Use PropTypes or TypeScript for type checking

```javascript
const TestResultCard = ({ run, onViewDetails }) => {
  const { status, duration, summary } = run;
  
  return (
    <Card className="test-result-card">
      {/* Component content */}
    </Card>
  );
};
```

---

## Submitting Changes

### Pull Request Checklist

Before submitting a PR, ensure:

- [ ] Code follows project style guidelines
- [ ] All tests pass locally
- [ ] New features include tests
- [ ] Documentation is updated
- [ ] Commit messages are clear
- [ ] PR description explains the changes

### PR Description Template

```markdown
## Description
Brief description of changes

## Type of Change
- [ ] Bug fix
- [ ] New feature
- [ ] Breaking change
- [ ] Documentation update

## How Has This Been Tested?
Describe tests you ran

## Checklist
- [ ] My code follows the project style guidelines
- [ ] I have performed a self-review
- [ ] I have added tests that prove my fix/feature works
- [ ] New and existing tests pass locally
```

---

## Issue Guidelines

### Reporting Bugs

Include:
- Clear, descriptive title
- Steps to reproduce
- Expected vs actual behavior
- Screenshots if applicable
- Environment details (OS, browser, Python/Node versions)

### Requesting Features

Include:
- Clear description of the feature
- Use case and benefits
- Possible implementation approach
- Mockups or examples if helpful

---

## Questions?

Feel free to open a Discussion on GitHub or reach out to the maintainers.

Thank you for contributing! 🎉
