import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from 'react-query';
import { Wifi, Plus, Edit2, Trash2, Save, X, Eye, EyeOff, Shield } from 'lucide-react';
import toast from 'react-hot-toast';
import { apiService } from '../services/api';

function WifiManagement() {
    const queryClient = useQueryClient();
    const [wifiNetworks, setWifiNetworks] = useState([]);
    const [editingId, setEditingId] = useState(null);
    const [showAddForm, setShowAddForm] = useState(false);
    const [showPassword, setShowPassword] = useState({});
    const [formData, setFormData] = useState({
        ssid: '',
        password: '',
        security: 'WPA2'
    });

    // Fetch devices to extract WiFi credentials
    const { data: devicesData, isLoading } = useQuery(
        'devices',
        () => apiService.getDevices(),
        {
            onSuccess: (data) => {
                const devices = data.devices || data || [];
                const networksMap = new Map();

                devices.forEach(device => {
                    if (device.wifi_ssid) {
                        if (!networksMap.has(device.wifi_ssid)) {
                            networksMap.set(device.wifi_ssid, {
                                id: device.wifi_ssid,
                                ssid: device.wifi_ssid,
                                password: device.wifi_password || '',
                                deviceCount: 1,
                                devices: [device.name || device.id]
                            });
                        } else {
                            const existing = networksMap.get(device.wifi_ssid);
                            existing.deviceCount++;
                            existing.devices.push(device.name || device.id);
                        }
                    }
                });

                setWifiNetworks(Array.from(networksMap.values()));
            }
        }
    );

    const handleAdd = () => {
        if (!formData.ssid) {
            toast.error('SSID is required');
            return;
        }

        const newNetwork = {
            id: formData.ssid,
            ssid: formData.ssid,
            password: formData.password,
            security: formData.security,
            deviceCount: 0,
            devices: []
        };

        setWifiNetworks([...wifiNetworks, newNetwork]);
        toast.success('WiFi network added to list');
        setShowAddForm(false);
        setFormData({ ssid: '', password: '', security: 'WPA2' });
    };

    const handleDelete = (ssid) => {
        const network = wifiNetworks.find(n => n.ssid === ssid);
        if (network && network.deviceCount > 0) {
            if (!window.confirm(`This network is used by ${network.deviceCount} device(s). Are you sure?`)) {
                return;
            }
        }
        setWifiNetworks(wifiNetworks.filter(n => n.ssid !== ssid));
        toast.success('WiFi network removed');
    };

    const handleEdit = (network) => {
        setEditingId(network.id);
        setFormData({
            ssid: network.ssid,
            password: network.password,
            security: network.security || 'WPA2'
        });
    };

    const handleSaveEdit = () => {
        setWifiNetworks(wifiNetworks.map(n =>
            n.id === editingId
                ? { ...n, ...formData }
                : n
        ));
        setEditingId(null);
        setFormData({ ssid: '', password: '', security: 'WPA2' });
        toast.success('WiFi network updated');
    };

    const togglePasswordVisibility = (id) => {
        setShowPassword(prev => ({ ...prev, [id]: !prev[id] }));
    };

    return (
        <div className="space-y-6 p-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">WiFi Management</h1>
                    <p className="text-sm text-gray-600 mt-1">
                        Manage saved WiFi networks for easy device configuration
                    </p>
                </div>
                <button
                    onClick={() => setShowAddForm(!showAddForm)}
                    className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 transition-colors"
                >
                    {showAddForm ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
                    {showAddForm ? 'Cancel' : 'Add Network'}
                </button>
            </div>

            {/* Add Form */}
            {showAddForm && (
                <div className="rounded-lg border-2 border-indigo-200 bg-indigo-50 p-6">
                    <h3 className="text-lg font-semibold text-gray-900 mb-4">Add New WiFi Network</h3>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">
                                SSID (Network Name) *
                            </label>
                            <input
                                type="text"
                                value={formData.ssid}
                                onChange={(e) => setFormData({ ...formData, ssid: e.target.value })}
                                className="w-full rounded-lg border border-gray-300 px-4 py-2 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
                                placeholder="My WiFi Network"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">
                                Password
                            </label>
                            <input
                                type="password"
                                value={formData.password}
                                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                                className="w-full rounded-lg border border-gray-300 px-4 py-2 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
                                placeholder="Network password"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">
                                Security
                            </label>
                            <select
                                value={formData.security}
                                onChange={(e) => setFormData({ ...formData, security: e.target.value })}
                                className="w-full rounded-lg border border-gray-300 px-4 py-2 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
                            >
                                <option value="WPA2">WPA2</option>
                                <option value="WPA3">WPA3</option>
                                <option value="WPA">WPA</option>
                                <option value="Open">Open</option>
                            </select>
                        </div>
                    </div>
                    <div className="mt-4 flex justify-end">
                        <button
                            onClick={handleAdd}
                            className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
                        >
                            <Save className="h-4 w-4" />
                            Save Network
                        </button>
                    </div>
                </div>
            )}

            {/* Networks List */}
            {isLoading ? (
                <div className="text-center py-12">
                    <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-indigo-600 border-t-transparent"></div>
                    <p className="mt-2 text-gray-600">Loading networks...</p>
                </div>
            ) : wifiNetworks.length === 0 ? (
                <div className="text-center py-12 bg-gray-50 rounded-lg border-2 border-dashed border-gray-300">
                    <Wifi className="h-12 w-12 mx-auto text-gray-400" />
                    <p className="mt-2 text-gray-600">No WiFi networks configured yet</p>
                    <p className="text-sm text-gray-500">Add a network to get started</p>
                </div>
            ) : (
                <div className="grid grid-cols-1 gap-4">
                    {wifiNetworks.map((network) => (
                        <div
                            key={network.id}
                            className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm hover:shadow-md transition-shadow"
                        >
                            {editingId === network.id ? (
                                // Edit Mode
                                <div className="space-y-4">
                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-2">
                                                SSID
                                            </label>
                                            <input
                                                type="text"
                                                value={formData.ssid}
                                                onChange={(e) => setFormData({ ...formData, ssid: e.target.value })}
                                                className="w-full rounded-lg border border-gray-300 px-4 py-2"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-2">
                                                Password
                                            </label>
                                            <input
                                                type="password"
                                                value={formData.password}
                                                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                                                className="w-full rounded-lg border border-gray-300 px-4 py-2"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-2">
                                                Security
                                            </label>
                                            <select
                                                value={formData.security}
                                                onChange={(e) => setFormData({ ...formData, security: e.target.value })}
                                                className="w-full rounded-lg border border-gray-300 px-4 py-2"
                                            >
                                                <option value="WPA2">WPA2</option>
                                                <option value="WPA3">WPA3</option>
                                                <option value="WPA">WPA</option>
                                                <option value="Open">Open</option>
                                            </select>
                                        </div>
                                    </div>
                                    <div className="flex gap-2">
                                        <button
                                            onClick={handleSaveEdit}
                                            className="inline-flex items-center gap-2 rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700"
                                        >
                                            <Save className="h-4 w-4" />
                                            Save
                                        </button>
                                        <button
                                            onClick={() => setEditingId(null)}
                                            className="inline-flex items-center gap-2 rounded-lg bg-gray-200 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-300"
                                        >
                                            <X className="h-4 w-4" />
                                            Cancel
                                        </button>
                                    </div>
                                </div>
                            ) : (
                                // View Mode
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-4 flex-1">
                                        <div className="w-12 h-12 rounded-lg bg-indigo-100 flex items-center justify-center">
                                            <Wifi className="h-6 w-6 text-indigo-600" />
                                        </div>
                                        <div className="flex-1">
                                            <div className="flex items-center gap-3">
                                                <h3 className="text-lg font-semibold text-gray-900">{network.ssid}</h3>
                                                <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-2 py-1 text-xs font-medium text-blue-700">
                                                    <Shield className="h-3 w-3" />
                                                    {network.security || 'WPA2'}
                                                </span>
                                            </div>
                                            <div className="mt-1 flex items-center gap-4 text-sm text-gray-600">
                                                <div className="flex items-center gap-2">
                                                    <button
                                                        onClick={() => togglePasswordVisibility(network.id)}
                                                        className="flex items-center gap-1 hover:text-gray-900"
                                                    >
                                                        {showPassword[network.id] ? (
                                                            <EyeOff className="h-4 w-4" />
                                                        ) : (
                                                            <Eye className="h-4 w-4" />
                                                        )}
                                                        <span className="font-mono">
                                                            {showPassword[network.id]
                                                                ? (network.password || 'No password')
                                                                : '••••••••'
                                                            }
                                                        </span>
                                                    </button>
                                                </div>
                                                {network.deviceCount > 0 && (
                                                    <span className="text-green-600 font-medium">
                                                        Used by {network.deviceCount} device{network.deviceCount > 1 ? 's' : ''}
                                                    </span>
                                                )}
                                            </div>
                                            {network.devices && network.devices.length > 0 && (
                                                <div className="mt-2 text-xs text-gray-500">
                                                    Devices: {network.devices.slice(0, 3).join(', ')}
                                                    {network.devices.length > 3 && ` +${network.devices.length - 3} more`}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <button
                                            onClick={() => handleEdit(network)}
                                            className="inline-flex items-center gap-2 rounded-lg bg-gray-100 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-200"
                                        >
                                            <Edit2 className="h-4 w-4" />
                                            Edit
                                        </button>
                                        <button
                                            onClick={() => handleDelete(network.ssid)}
                                            className="inline-flex items-center gap-2 rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-100"
                                        >
                                            <Trash2 className="h-4 w-4" />
                                            Delete
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

export default WifiManagement;
