# Frontend Error Handling Guide

## Overview

The application uses a centralized error handling system that provides:
- Consistent user-friendly error messages
- Automatic toast notifications
- Error logging and debugging
- React Error Boundaries for crash protection
- Custom hooks for easy integration

## Components

### 1. Error Handler Service (`services/errorHandler.js`)

The core error handling service that processes all errors.

```javascript
import { handleError, showSuccess, showWarning, showInfo } from '../services/errorHandler';

// Handle an error
try {
  await someAsyncOperation();
} catch (error) {
  handleError(error, {
    customMessage: 'Failed to complete operation',
    context: 'User Management',
    showToast: true
  });
}

// Show success message
showSuccess('Operation completed successfully');

// Show warning
showWarning('This action cannot be undone');

// Show info
showInfo('Data will be synced in a few minutes');
```

### 2. Error Boundary Component (`components/ErrorBoundary.jsx`)

Catches JavaScript errors in component trees and displays a fallback UI.

```jsx
import ErrorBoundary, { SectionErrorBoundary } from '../components/ErrorBoundary';

// Wrap entire app or route
<ErrorBoundary context="Dashboard">
  <Dashboard />
</ErrorBoundary>

// Wrap specific section
<SectionErrorBoundary sectionName="Device List">
  <DeviceList />
</SectionErrorBoundary>

// Custom fallback UI
<ErrorBoundary
  context="Critical Section"
  fallback={(error, reset) => (
    <div>
      <h2>Custom Error UI</h2>
      <p>{error.message}</p>
      <button onClick={reset}>Retry</button>
    </div>
  )}
>
  <CriticalComponent />
</ErrorBoundary>
```

### 3. Error Handler Hook (`hooks/useErrorHandler.js`)

Custom React hook for functional components.

```javascript
import { useErrorHandler } from '../hooks/useErrorHandler';

function MyComponent() {
  const { handleError, showSuccess, createMutationHandlers, safeAsync } = useErrorHandler('My Component');

  // Method 1: Manual error handling
  const handleDelete = async (id) => {
    try {
      await apiService.deleteItem(id);
      showSuccess('Item deleted');
    } catch (error) {
      handleError(error);
    }
  };

  // Method 2: React Query mutations
  const deleteMutation = useMutation(
    (id) => apiService.deleteItem(id),
    createMutationHandlers({
      successMessage: 'Item deleted',
      errorMessage: 'Failed to delete item',
      onSuccess: () => {
        // Additional success logic
      }
    })
  );

  // Method 3: Safe async with loading state
  const handleSave = async () => {
    const result = await safeAsync(
      () => apiService.saveItem(data),
      {
        successMessage: 'Saved successfully',
        errorMessage: 'Failed to save',
        showLoading: true,
        loadingMessage: 'Saving...'
      }
    );

    if (result.success) {
      console.log('Data:', result.data);
    }
  };

  return <div>...</div>;
}
```

## Error Types

The error handler recognizes and handles different error types:

### 1. API Errors (Axios responses)

```javascript
// Automatic handling based on status code:
// 400 - Validation errors
// 401 - Authentication (auto redirects to login)
// 403 - Authorization (permission denied)
// 404 - Not found
// 409 - Conflict
// 422 - Validation
// 429 - Rate limit
// 500+ - Server errors
```

### 2. Network Errors

No response received from server (connection issues).

### 3. JavaScript Errors

Runtime errors, caught by Error Boundaries.

### 4. Validation Errors

Field-level validation errors from the API.

```javascript
const { handleFormError } = useErrorHandler('Form');

const handleSubmit = async (formData) => {
  try {
    await apiService.submit(formData);
  } catch (error) {
    const { fieldErrors, generalError } = handleFormError(error, {
      email: 'email',
      password: 'password',
      name: 'name'
    });

    // fieldErrors = { email: 'Invalid email', ... }
    // Set form field errors here
  }
};
```

## Usage Patterns

### Pattern 1: Simple Component with Error Handling

```jsx
import React from 'react';
import { useQuery } from 'react-query';
import { useErrorHandler } from '../hooks/useErrorHandler';
import { apiService } from '../services/api';

function DeviceList() {
  const { handleError, showSuccess } = useErrorHandler('Device List');

  const { data, isLoading } = useQuery(
    'devices',
    () => apiService.getDevices(),
    {
      onError: (error) => handleError(error, {
        customMessage: 'Failed to load devices'
      })
    }
  );

  if (isLoading) return <div>Loading...</div>;

  return (
    <div>
      {/* Device list rendering */}
    </div>
  );
}

export default DeviceList;
```

### Pattern 2: Component with CRUD Operations

```jsx
import React from 'react';
import { useQuery, useMutation, useQueryClient } from 'react-query';
import { useErrorHandler } from '../hooks/useErrorHandler';
import { apiService } from '../services/api';

function DeviceManagement() {
  const queryClient = useQueryClient();
  const { handleError, createMutationHandlers } = useErrorHandler('Device Management');

  // Query
  const { data: devices } = useQuery(
    'devices',
    () => apiService.getDevices(),
    {
      onError: (error) => handleError(error)
    }
  );

  // Create mutation
  const createMutation = useMutation(
    (deviceData) => apiService.createDevice(deviceData),
    createMutationHandlers({
      successMessage: 'Device created successfully',
      errorMessage: 'Failed to create device',
      onSuccess: () => {
        queryClient.invalidateQueries('devices');
        // Additional logic
      }
    })
  );

  // Update mutation
  const updateMutation = useMutation(
    ({ id, data }) => apiService.updateDevice(id, data),
    createMutationHandlers({
      successMessage: 'Device updated',
      errorMessage: 'Failed to update device',
      onSuccess: () => queryClient.invalidateQueries('devices')
    })
  );

  // Delete mutation
  const deleteMutation = useMutation(
    (id) => apiService.deleteDevice(id),
    createMutationHandlers({
      successMessage: 'Device deleted',
      errorMessage: 'Failed to delete device',
      onSuccess: () => queryClient.invalidateQueries('devices')
    })
  );

  return <div>...</div>;
}
```

### Pattern 3: Form with Validation

```jsx
import React, { useState } from 'react';
import { useErrorHandler } from '../hooks/useErrorHandler';
import { apiService } from '../services/api';

function DeviceForm() {
  const { handleFormError, showSuccess } = useErrorHandler('Device Form');
  const [formData, setFormData] = useState({ name: '', location: '' });
  const [errors, setErrors] = useState({});

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrors({});

    try {
      await apiService.createDevice(formData);
      showSuccess('Device created successfully');
      setFormData({ name: '', location: '' });
    } catch (error) {
      const { fieldErrors, generalError } = handleFormError(error, {
        name: 'name',
        location: 'location'
      });

      setErrors(fieldErrors);

      if (Object.keys(fieldErrors).length === 0 && generalError) {
        // Show general error if no field-specific errors
        console.error(generalError);
      }
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      <div>
        <input
          name="name"
          value={formData.name}
          onChange={(e) => setFormData({ ...formData, name: e.target.value })}
        />
        {errors.name && <span className="error">{errors.name}</span>}
      </div>
      {/* More fields */}
      <button type="submit">Create Device</button>
    </form>
  );
}
```

### Pattern 4: Async Operations with Loading

```jsx
import React from 'react';
import { useErrorHandler } from '../hooks/useErrorHandler';
import { apiService } from '../services/api';

function DataExporter() {
  const { safeAsync } = useErrorHandler('Data Export');

  const handleExport = async () => {
    const result = await safeAsync(
      () => apiService.exportData(),
      {
        successMessage: 'Data exported successfully',
        errorMessage: 'Failed to export data',
        showLoading: true,
        loadingMessage: 'Exporting data...',
        onSuccess: (data) => {
          // Download file
          const blob = new Blob([data], { type: 'application/json' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = 'export.json';
          a.click();
        }
      }
    );

    if (!result.success) {
      console.error('Export failed:', result.error);
    }
  };

  return (
    <button onClick={handleExport}>
      Export Data
    </button>
  );
}
```

## Best Practices

### 1. Always Provide Context

```javascript
// Good
const { handleError } = useErrorHandler('Device Management');

// Bad
const { handleError } = useErrorHandler();
```

Context helps with debugging and provides better error messages.

### 2. Use Custom Messages for User-Facing Operations

```javascript
// Good
handleError(error, {
  customMessage: 'Failed to delete device. It may have associated data.'
});

// Less helpful
handleError(error);
```

### 3. Wrap Critical Sections with Error Boundaries

```jsx
// Good - Protects entire route
<ErrorBoundary context="Device Management Page">
  <DeviceManagement />
</ErrorBoundary>

// Good - Protects specific section
<div>
  <Header />
  <SectionErrorBoundary sectionName="Device List">
    <DeviceList />
  </SectionErrorBoundary>
  <SectionErrorBoundary sectionName="Device Stats">
    <DeviceStats />
  </SectionErrorBoundary>
</div>
```

### 4. Don't Suppress Errors Silently

```javascript
// Bad
try {
  await operation();
} catch (error) {
  // Silent failure
}

// Good
try {
  await operation();
} catch (error) {
  handleError(error, { showToast: false }); // Still logs
}
```

### 5. Use Appropriate Notification Types

```javascript
// Error - for failures
handleError(error);

// Success - for successful operations
showSuccess('Device created');

// Warning - for potential issues
showWarning('This action cannot be undone');

// Info - for informational messages
showInfo('Syncing data in background');
```

## Configuration

### Toast Settings

Toasts are configured in `App.jsx`:

```jsx
<Toaster position="top-right" />
```

You can customize individual toasts:

```javascript
showSuccess('Message', {
  duration: 5000,  // 5 seconds
  position: 'bottom-center'
});
```

### Error Logging

In development mode, errors are automatically logged to console with full details.

To export error log:

```javascript
import errorHandler from '../services/errorHandler';

// Get error log
const errors = errorHandler.getErrorLog();

// Export as JSON file
errorHandler.exportErrorLog();

// Clear log
errorHandler.clearErrorLog();
```

## Migration Guide

To update an existing component:

### Before:

```javascript
import toast from 'react-hot-toast';

const mutation = useMutation(apiCall, {
  onSuccess: () => {
    toast.success('Success');
    queryClient.invalidateQueries('data');
  },
  onError: (error) => {
    toast.error(error.response?.data?.error || 'Failed');
  }
});
```

### After:

```javascript
import { useErrorHandler } from '../hooks/useErrorHandler';

const { createMutationHandlers } = useErrorHandler('Component Name');

const mutation = useMutation(
  apiCall,
  createMutationHandlers({
    successMessage: 'Success',
    errorMessage: 'Failed',
    onSuccess: () => {
      queryClient.invalidateQueries('data');
    }
  })
);
```

## Troubleshooting

### Error not showing toast

Check that:
1. `<Toaster />` is rendered in App.jsx
2. `showToast` option is not set to `false`
3. No other error is currently being displayed

### Authentication redirect not working

The error handler automatically redirects on 401 errors after 2 seconds. Ensure:
1. Token is stored in `localStorage` with key `'token'`
2. API returns 401 status for invalid/expired tokens

### Error boundaries not catching errors

Error boundaries only catch errors during:
- Rendering
- Lifecycle methods
- Constructors

They don't catch:
- Event handlers (use try-catch)
- Async code (use try-catch)
- Server-side rendering errors
- Errors in error boundary itself

Use the `handleError` function for these cases.

## Advanced Usage

### Custom Error Types

```javascript
class CustomError extends Error {
  constructor(message, code) {
    super(message);
    this.name = 'CustomError';
    this.code = code;
  }
}

// In your code
try {
  throw new CustomError('Something went wrong', 'CUSTOM_001');
} catch (error) {
  handleError(error, {
    customMessage: `Error ${error.code}: ${error.message}`
  });
}
```

### Retry Logic

```javascript
const { handleAsyncError } = useErrorHandler('API Calls');

const retryableOperation = handleAsyncError(
  async (data) => {
    let attempts = 0;
    const maxAttempts = 3;

    while (attempts < maxAttempts) {
      try {
        return await apiService.unstableOperation(data);
      } catch (error) {
        attempts++;
        if (attempts === maxAttempts) throw error;
        await new Promise(r => setTimeout(r, 1000 * attempts));
      }
    }
  },
  {
    errorMessage: 'Operation failed after 3 attempts'
  }
);
```

## Testing

```javascript
import { render, screen } from '@testing-library/react';
import { useErrorHandler } from '../hooks/useErrorHandler';

// Mock the error handler
jest.mock('../hooks/useErrorHandler');

test('handles error correctly', () => {
  const mockHandleError = jest.fn();
  useErrorHandler.mockReturnValue({ handleError: mockHandleError });

  // Test your component
  render(<YourComponent />);

  // Trigger error
  fireEvent.click(screen.getByText('Trigger Error'));

  // Assert
  expect(mockHandleError).toHaveBeenCalledWith(
    expect.any(Error),
    expect.objectContaining({
      customMessage: 'Expected error message'
    })
  );
});
```

## Summary

The error handling system provides:
- ✅ Consistent UX across the application
- ✅ User-friendly error messages
- ✅ Automatic authentication handling
- ✅ Error logging for debugging
- ✅ Protection against crashes
- ✅ Easy integration with React Query
- ✅ Type-safe error processing
- ✅ Flexible customization options

Use the provided hooks and components to ensure all errors are handled gracefully and users receive appropriate feedback.
