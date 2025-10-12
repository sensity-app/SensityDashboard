import React, { useState, useEffect } from 'react';
import LoadingSpinner, { LoadingButton, SkeletonLoader } from '../components/LoadingSpinner';
import { useToast, useToastWithAsync } from '../components/Toast';
import apiService from '../services/apiService';

/**
 * Example: DeviceManagement with Loading States and Pagination
 *
 * This is an example showing how to integrate:
 * - Loading spinners
 * - Toast notifications
 * - Pagination
 * - Better error handling
 *
 * Copy the patterns from this file to update existing components.
 */

const DeviceManagementExample = () => {
    const [devices, setDevices] = useState([]);
    const [loading, setLoading] = useState(true);
    const [page, setPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const [limit] = useState(50);
    const [filters, setFilters] = useState({
        status: '',
        location_id: '',
        search: ''
    });

    const { success, error } = useToast();
    const { withToast } = useToastWithAsync();

    // Fetch devices with loading state
    useEffect(() => {
        fetchDevices();
    }, [page, filters]);

    const fetchDevices = async () => {
        setLoading(true);
        try {
            const params = {
                page,
                limit,
                ...filters
            };

            const response = await apiService.getDevices(params);

            setDevices(response.devices || []);
            setTotalPages(response.totalPages || 1);
        } catch (err) {
            error('Failed to load devices: ' + (err.message || 'Unknown error'));
        } finally {
            setLoading(false);
        }
    };

    // Delete device with toast notifications
    const handleDeleteDevice = async (deviceId) => {
        if (!window.confirm('Are you sure you want to delete this device?')) {
            return;
        }

        await withToast(
            async () => {
                await apiService.deleteDevice(deviceId);
                // Refresh device list
                await fetchDevices();
            },
            {
                loading: 'Deleting device...',
                success: 'Device deleted successfully!',
                error: 'Failed to delete device'
            }
        );
    };

    // Update device with toast
    const handleUpdateDevice = async (deviceId, updates) => {
        await withToast(
            async () => {
                await apiService.updateDevice(deviceId, updates);
                // Refresh device list
                await fetchDevices();
            },
            {
                loading: 'Updating device...',
                success: 'Device updated successfully!',
                error: 'Failed to update device'
            }
        );
    };

    // Export devices with toast
    const handleExportCSV = async () => {
        await withToast(
            async () => {
                const response = await apiService.exportDevices(filters);
                const blob = new Blob([response], { type: 'text/csv' });
                const url = window.URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `devices_export_${new Date().toISOString().split('T')[0]}.csv`;
                a.click();
                window.URL.revokeObjectURL(url);
            },
            {
                loading: 'Exporting devices...',
                success: 'Devices exported successfully!',
                error: 'Failed to export devices'
            }
        );
    };

    return (
        <div className="device-management">
            <div className="page-header">
                <h1>Device Management</h1>
                <div className="header-actions">
                    <LoadingButton
                        variant="secondary"
                        onClick={handleExportCSV}
                    >
                        Export CSV
                    </LoadingButton>
                    <LoadingButton
                        variant="primary"
                        onClick={() => {/* Add device logic */}}
                    >
                        + Add Device
                    </LoadingButton>
                </div>
            </div>

            {/* Filters */}
            <div className="filters">
                <input
                    type="text"
                    placeholder="Search devices..."
                    value={filters.search}
                    onChange={(e) => setFilters({ ...filters, search: e.target.value })}
                    className="search-input"
                />
                <select
                    value={filters.status}
                    onChange={(e) => setFilters({ ...filters, status: e.target.value })}
                    className="filter-select"
                >
                    <option value="">All Status</option>
                    <option value="online">Online</option>
                    <option value="offline">Offline</option>
                    <option value="error">Error</option>
                </select>
                <LoadingButton
                    variant="secondary"
                    onClick={() => setFilters({ status: '', location_id: '', search: '' })}
                >
                    Clear Filters
                </LoadingButton>
            </div>

            {/* Device List */}
            <div className="devices-container">
                {loading ? (
                    /* Show skeleton loaders while loading */
                    <SkeletonLoader count={10} height="80px" />
                ) : devices.length === 0 ? (
                    /* Empty state */
                    <div className="empty-state">
                        <p>No devices found</p>
                    </div>
                ) : (
                    /* Device cards */
                    <div className="device-grid">
                        {devices.map(device => (
                            <DeviceCard
                                key={device.id}
                                device={device}
                                onDelete={handleDeleteDevice}
                                onUpdate={handleUpdateDevice}
                            />
                        ))}
                    </div>
                )}
            </div>

            {/* Pagination */}
            {!loading && devices.length > 0 && (
                <Pagination
                    currentPage={page}
                    totalPages={totalPages}
                    onPageChange={setPage}
                />
            )}
        </div>
    );
};

// Device Card Component with Loading States
const DeviceCard = ({ device, onDelete, onUpdate }) => {
    const [updating, setUpdating] = useState(false);
    const [deleting, setDeleting] = useState(false);

    const handleDelete = async () => {
        setDeleting(true);
        try {
            await onDelete(device.id);
        } finally {
            setDeleting(false);
        }
    };

    const handleToggleStatus = async () => {
        setUpdating(true);
        try {
            const newStatus = device.status === 'online' ? 'offline' : 'online';
            await onUpdate(device.id, { status: newStatus });
        } finally {
            setUpdating(false);
        }
    };

    return (
        <div className={`device-card ${updating || deleting ? 'loading-blur' : ''}`}>
            <div className="device-header">
                <h3>{device.name}</h3>
                <span className={`status-badge status-${device.status}`}>
                    {device.status}
                </span>
            </div>

            <div className="device-info">
                <p><strong>Type:</strong> {device.device_type}</p>
                <p><strong>Location:</strong> {device.location_name || 'N/A'}</p>
                <p><strong>Firmware:</strong> {device.firmware_version || 'N/A'}</p>
                <p><strong>Last Seen:</strong> {new Date(device.last_heartbeat).toLocaleString()}</p>
            </div>

            <div className="device-actions">
                <LoadingButton
                    variant="secondary"
                    size="small"
                    loading={updating}
                    onClick={handleToggleStatus}
                >
                    Toggle Status
                </LoadingButton>
                <LoadingButton
                    variant="danger"
                    size="small"
                    loading={deleting}
                    onClick={handleDelete}
                >
                    Delete
                </LoadingButton>
            </div>
        </div>
    );
};

// Pagination Component
const Pagination = ({ currentPage, totalPages, onPageChange }) => {
    const pages = [];
    const maxVisible = 5;

    // Calculate visible page numbers
    let startPage = Math.max(1, currentPage - Math.floor(maxVisible / 2));
    let endPage = Math.min(totalPages, startPage + maxVisible - 1);

    if (endPage - startPage < maxVisible - 1) {
        startPage = Math.max(1, endPage - maxVisible + 1);
    }

    for (let i = startPage; i <= endPage; i++) {
        pages.push(i);
    }

    return (
        <div className="pagination">
            <button
                className="pagination-btn"
                onClick={() => onPageChange(currentPage - 1)}
                disabled={currentPage === 1}
            >
                Previous
            </button>

            {startPage > 1 && (
                <>
                    <button
                        className="pagination-number"
                        onClick={() => onPageChange(1)}
                    >
                        1
                    </button>
                    {startPage > 2 && <span className="pagination-ellipsis">...</span>}
                </>
            )}

            {pages.map(page => (
                <button
                    key={page}
                    className={`pagination-number ${page === currentPage ? 'active' : ''}`}
                    onClick={() => onPageChange(page)}
                >
                    {page}
                </button>
            ))}

            {endPage < totalPages && (
                <>
                    {endPage < totalPages - 1 && <span className="pagination-ellipsis">...</span>}
                    <button
                        className="pagination-number"
                        onClick={() => onPageChange(totalPages)}
                    >
                        {totalPages}
                    </button>
                </>
            )}

            <button
                className="pagination-btn"
                onClick={() => onPageChange(currentPage + 1)}
                disabled={currentPage === totalPages}
            >
                Next
            </button>
        </div>
    );
};

export default DeviceManagementExample;
