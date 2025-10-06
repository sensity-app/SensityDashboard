# 🤝 Contributing to ESP8266 IoT Management Platform

Thank you for your interest in contributing to the ESP8266 IoT Management Platform! This document provides guidelines and instructions for contributing.

## 📋 Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Getting Started](#getting-started)
- [Development Setup](#development-setup)
- [How to Contribute](#how-to-contribute)
- [Coding Standards](#coding-standards)
- [Testing Guidelines](#testing-guidelines)
- [Pull Request Process](#pull-request-process)
- [Reporting Bugs](#reporting-bugs)
- [Suggesting Features](#suggesting-features)
- [Documentation](#documentation)
- [Community](#community)

---

## 📜 Code of Conduct

### Our Pledge

We are committed to providing a welcoming and inspiring community for all. Please be respectful and constructive in all interactions.

### Our Standards

**Positive behavior includes:**
- Using welcoming and inclusive language
- Respecting differing viewpoints and experiences
- Accepting constructive criticism gracefully
- Focusing on what's best for the community
- Showing empathy towards others

**Unacceptable behavior includes:**
- Harassment, trolling, or derogatory comments
- Personal or political attacks
- Publishing others' private information
- Other unprofessional conduct

### Enforcement

Instances of unacceptable behavior may be reported by opening an issue or contacting the project maintainers. All complaints will be reviewed and investigated.

---

## 🚀 Getting Started

### Prerequisites

Before contributing, ensure you have:
- **Node.js** 18.x or higher
- **PostgreSQL** 12.x or higher
- **Redis** 6.x or higher
- **Git** for version control
- **Code Editor** (VS Code recommended)
- **Basic knowledge** of JavaScript/Node.js, React, and PostgreSQL

### First Contribution Ideas

Good first contributions:
- 📝 Fix typos in documentation
- 🐛 Fix simple bugs with clear reproduction steps
- 🎨 Improve UI/UX in the frontend
- 🌍 Add translations for new languages
- ✅ Add unit tests for existing code
- 📚 Improve code comments

Look for issues labeled:
- `good-first-issue`
- `help-wanted`
- `documentation`
- `bug`

---

## 💻 Development Setup

### 1. Fork and Clone

```bash
# Fork the repository on GitHub, then clone your fork
git clone https://github.com/YOUR-USERNAME/SensityDashboard.git
cd SensityDashboard

# Add upstream remote
git remote add upstream https://github.com/sensity-app/SensityDashboard.git
```

### 2. Install Dependencies

**Backend:**
```bash
cd backend
npm install
```

**Frontend:**
```bash
cd frontend
npm install
```

### 3. Setup Database

```bash
# Create database
createdb esp8266_platform

# Run schema
psql -d esp8266_platform -f database/schema.sql

# Run migrations
cd backend
node migrations/migrate.js
```

### 4. Configure Environment

**Backend `.env`:**
```bash
cp backend/.env.example backend/.env
# Edit backend/.env with your local settings
```

**Frontend `.env`:**
```bash
cp frontend/.env.example frontend/.env
# Edit frontend/.env with your local settings
```

### 5. Start Development Servers

**Terminal 1 - Backend:**
```bash
cd backend
npm run dev
```

**Terminal 2 - Frontend:**
```bash
cd frontend
npm start
```

**Terminal 3 - Redis (if not running as service):**
```bash
redis-server
```

### 6. Verify Setup

- Frontend: http://localhost:5173
- Backend API: http://localhost:3001
- Health check: http://localhost:3001/health

---

## 🛠️ How to Contribute

### Workflow

1. **Create a Branch**
   ```bash
   git checkout -b feature/your-feature-name
   # or
   git checkout -b bugfix/issue-number-description
   ```

2. **Make Changes**
   - Write clean, readable code
   - Follow coding standards (see below)
   - Add comments for complex logic
   - Update documentation if needed

3. **Test Your Changes**
   - Test functionality manually
   - Add unit/integration tests
   - Ensure existing tests pass
   - Check for console errors

4. **Commit Changes**
   ```bash
   git add .
   git commit -m "feat: add new sensor calibration feature"
   ```

5. **Push to Your Fork**
   ```bash
   git push origin feature/your-feature-name
   ```

6. **Create Pull Request**
   - Go to GitHub and create a PR from your fork
   - Fill out the PR template
   - Link related issues
   - Request review from maintainers

### Types of Contributions

#### 🐛 Bug Fixes
- Always create an issue first (or find existing one)
- Include reproduction steps
- Add tests to prevent regression
- Update CHANGELOG.md

#### ✨ New Features
- Discuss feature in an issue before implementing
- Break large features into smaller PRs
- Add documentation
- Add tests
- Update CHANGELOG.md

#### 📚 Documentation
- Fix typos, improve clarity
- Add examples and use cases
- Keep documentation up-to-date with code
- Update API docs for endpoint changes

#### 🌍 Translations
- Add new language files in `frontend/src/i18n/locales/`
- Follow existing structure
- Test in the application
- Update language selector component

#### 🎨 UI/UX Improvements
- Ensure responsive design (mobile, tablet, desktop)
- Follow existing design patterns
- Use Tailwind CSS utility classes
- Test in multiple browsers

---

## 📏 Coding Standards

### JavaScript/Node.js

**Style:**
```javascript
// Use ES6+ features
const myFunction = async (param1, param2) => {
  // Clear variable names
  const deviceData = await fetchDevice(param1);

  // Early returns for error cases
  if (!deviceData) {
    return null;
  }

  // Single responsibility functions
  return processDevice(deviceData);
};

// Use async/await over promises
const getData = async () => {
  try {
    const result = await db.query('SELECT * FROM devices');
    return result.rows;
  } catch (error) {
    logger.error('Database error:', error);
    throw error;
  }
};
```

**Best Practices:**
- ✅ Use `const` and `let`, avoid `var`
- ✅ Use async/await instead of callbacks
- ✅ Handle errors properly (try/catch)
- ✅ Use descriptive variable names
- ✅ Add JSDoc comments for functions
- ✅ Keep functions small and focused
- ✅ Avoid deeply nested code

### React/Frontend

**Component Structure:**
```jsx
import React, { useState, useEffect } from 'react';
import PropTypes from 'prop-types';

/**
 * Device card component displaying sensor information
 * @param {Object} device - Device object with id, name, sensors
 */
const DeviceCard = ({ device }) => {
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    // Fetch additional data if needed
  }, [device.id]);

  return (
    <div className="bg-white rounded-lg shadow-md p-4">
      <h3 className="text-lg font-semibold">{device.name}</h3>
      {/* Component content */}
    </div>
  );
};

DeviceCard.propTypes = {
  device: PropTypes.shape({
    id: PropTypes.string.isRequired,
    name: PropTypes.string.isRequired,
    sensors: PropTypes.array
  }).isRequired
};

export default DeviceCard;
```

**Best Practices:**
- ✅ Use functional components with hooks
- ✅ PropTypes for type checking
- ✅ Destructure props
- ✅ Use custom hooks for reusable logic
- ✅ Keep components small and focused
- ✅ Use React Query for data fetching
- ✅ Memoize expensive computations

### Database

**SQL Queries:**
```javascript
// Use parameterized queries (prevent SQL injection)
const result = await db.query(
  'SELECT * FROM devices WHERE id = $1 AND user_id = $2',
  [deviceId, userId]
);

// Add indexes for frequently queried columns
CREATE INDEX idx_devices_user_id ON devices(user_id);
CREATE INDEX idx_telemetry_device_timestamp ON telemetry(device_id, timestamp);

// Use transactions for multiple related operations
const client = await db.connect();
try {
  await client.query('BEGIN');
  await client.query('UPDATE devices SET status = $1 WHERE id = $2', ['offline', deviceId]);
  await client.query('INSERT INTO events (device_id, type) VALUES ($1, $2)', [deviceId, 'offline']);
  await client.query('COMMIT');
} catch (error) {
  await client.query('ROLLBACK');
  throw error;
} finally {
  client.release();
}
```

### API Design

**RESTful Endpoints:**
```javascript
// Use clear, consistent naming
GET    /api/devices           // List all devices
GET    /api/devices/:id       // Get single device
POST   /api/devices           // Create device
PUT    /api/devices/:id       // Update device
DELETE /api/devices/:id       // Delete device

// Nested resources
GET    /api/devices/:id/sensors
PUT    /api/devices/:id/sensors/:sensorId

// Use appropriate HTTP status codes
200 OK                 // Success
201 Created            // Resource created
400 Bad Request        // Invalid input
401 Unauthorized       // Not authenticated
403 Forbidden          // Not authorized
404 Not Found          // Resource doesn't exist
500 Internal Server    // Server error
```

### Commit Messages

Follow [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>(<scope>): <subject>

<body>

<footer>
```

**Types:**
- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation changes
- `style`: Code style changes (formatting)
- `refactor`: Code refactoring
- `test`: Adding or updating tests
- `chore`: Build process or auxiliary tool changes

**Examples:**
```bash
feat(sensors): add calibration offset configuration

Add ability to configure calibration offset for sensors in the device
detail page. Users can now adjust sensor readings with an offset value.

Closes #123

---

fix(auth): resolve token expiration handling

Fix issue where expired tokens were not properly cleared from
localStorage, causing repeated 401 errors.

Fixes #456

---

docs(api): add endpoint documentation for telemetry

Add comprehensive documentation for telemetry endpoints including
request/response examples and error codes.
```

---

## 🧪 Testing Guidelines

### Unit Tests

**Backend Example:**
```javascript
// backend/src/routes/__tests__/devices.test.js
const request = require('supertest');
const app = require('../../server');
const db = require('../../models/database');

describe('Device API', () => {
  beforeAll(async () => {
    // Setup test database
  });

  afterAll(async () => {
    // Cleanup
  });

  test('GET /api/devices returns device list', async () => {
    const response = await request(app)
      .get('/api/devices')
      .set('Authorization', `Bearer ${testToken}`);

    expect(response.status).toBe(200);
    expect(response.body.devices).toBeInstanceOf(Array);
  });

  test('POST /api/devices creates new device', async () => {
    const newDevice = {
      device_id: 'TEST-001',
      name: 'Test Device'
    };

    const response = await request(app)
      .post('/api/devices')
      .set('Authorization', `Bearer ${testToken}`)
      .send(newDevice);

    expect(response.status).toBe(201);
    expect(response.body.device.name).toBe('Test Device');
  });
});
```

**Frontend Example:**
```javascript
// frontend/src/components/__tests__/DeviceCard.test.js
import { render, screen } from '@testing-library/react';
import DeviceCard from '../DeviceCard';

describe('DeviceCard Component', () => {
  const mockDevice = {
    id: '123',
    name: 'Kitchen Sensor',
    status: 'online'
  };

  test('renders device name', () => {
    render(<DeviceCard device={mockDevice} />);
    expect(screen.getByText('Kitchen Sensor')).toBeInTheDocument();
  });

  test('shows online status', () => {
    render(<DeviceCard device={mockDevice} />);
    expect(screen.getByText(/online/i)).toBeInTheDocument();
  });
});
```

### Running Tests

```bash
# Backend tests
cd backend
npm test

# Frontend tests
cd frontend
npm test

# Run with coverage
npm test -- --coverage
```

---

## 🔄 Pull Request Process

### Before Submitting

- [ ] Code follows project style guidelines
- [ ] Self-review completed
- [ ] Comments added for complex logic
- [ ] Documentation updated
- [ ] Tests added/updated and passing
- [ ] No console errors or warnings
- [ ] CHANGELOG.md updated

### PR Template

```markdown
## Description
Brief description of changes

## Related Issue
Closes #123

## Type of Change
- [ ] Bug fix
- [ ] New feature
- [ ] Documentation update
- [ ] Code refactoring

## Testing
How was this tested?

## Screenshots (if applicable)
Add screenshots for UI changes

## Checklist
- [ ] Code follows style guidelines
- [ ] Self-review completed
- [ ] Tests added/passing
- [ ] Documentation updated
- [ ] CHANGELOG.md updated
```

### Review Process

1. **Automated Checks** (when CI/CD is set up)
   - Linting
   - Tests
   - Build verification

2. **Code Review**
   - At least one maintainer approval required
   - Address all comments
   - Re-request review after changes

3. **Merge**
   - Squash and merge (preferred)
   - Rebase and merge (for feature branches)
   - Maintainers will merge after approval

---

## 🐛 Reporting Bugs

### Before Reporting

1. **Search existing issues** - your bug may already be reported
2. **Update to latest version** - bug may be fixed
3. **Verify it's reproducible** - can you trigger it consistently?

### Bug Report Template

```markdown
**Bug Description**
Clear description of the bug

**Steps to Reproduce**
1. Go to '...'
2. Click on '...'
3. See error

**Expected Behavior**
What should happen

**Actual Behavior**
What actually happens

**Screenshots**
If applicable

**Environment**
- OS: [e.g., Ubuntu 22.04]
- Browser: [e.g., Chrome 120]
- Version: [e.g., 2.2.0]

**Additional Context**
Any other relevant information
```

### Severity Labels

- `critical`: System crash, data loss
- `high`: Major feature broken
- `medium`: Feature partially working
- `low`: Minor issue, cosmetic

---

## 💡 Suggesting Features

### Feature Request Template

```markdown
**Problem Statement**
What problem does this solve?

**Proposed Solution**
Describe your idea

**Alternatives Considered**
Other approaches you've thought about

**Additional Context**
Screenshots, mockups, etc.

**Impact**
Who would benefit from this?
```

### Feature Discussion

- Open an issue with `feature-request` label
- Discuss approach with maintainers
- Get approval before implementing
- Create design document for large features

---

## 📚 Documentation

### What to Document

- **Code**: JSDoc comments for functions
- **API**: Update docs/API.md for endpoint changes
- **Features**: Add usage examples
- **Setup**: Update installation/deployment docs
- **Troubleshooting**: Add common issues and solutions

### Documentation Style

- Use clear, simple language
- Add code examples
- Include screenshots for UI features
- Keep it up-to-date

---

## 👥 Community

### Getting Help

- **GitHub Discussions**: Ask questions, share ideas
- **GitHub Issues**: Bug reports, feature requests
- **Pull Requests**: Code contributions

### Recognition

Contributors are recognized in:
- README.md (Contributors section)
- Release notes
- CHANGELOG.md

---

## 📄 License

By contributing, you agree that your contributions will be licensed under the MIT License.

---

## 🙏 Thank You!

Your contributions make this project better for everyone. We appreciate your time and effort!

**Happy Contributing!** 🎉

---

**Questions?** Open an issue or start a discussion on GitHub.

**Last Updated**: October 2025
