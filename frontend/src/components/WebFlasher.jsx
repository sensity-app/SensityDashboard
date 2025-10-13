import React, { useState, useRef } from 'react';
import { Zap, Download, AlertTriangle, CheckCircle, Upload, Usb } from 'lucide-react';
import { ESPLoader, Transport } from 'esptool-js';

const WebFlasher = ({ config, onClose }) => {
    const [isFlashing, setIsFlashing] = useState(false);
    const [flashProgress, setFlashProgress] = useState(0);
    const [flashStatus, setFlashStatus] = useState('');
    const [isConnected, setIsConnected] = useState(false);
    const [port, setPort] = useState(null);
    const [log, setLog] = useState([]);
    const [supportsWebSerial, setSupportsWebSerial] = useState(false);
    const [isMonitoring, setIsMonitoring] = useState(false);

    const logRef = useRef(null);
    const monitorReaderRef = useRef(null);
    const monitorStreamClosedRef = useRef(null);

    React.useEffect(() => {
        // Check if browser supports WebSerial API
        const checkWebSerialSupport = () => {
            console.log('Checking Web Serial API support...');
            console.log('navigator.serial exists:', 'serial' in navigator);
            console.log('Is secure context (HTTPS/localhost):', window.isSecureContext);
            console.log('User agent:', navigator.userAgent);
            console.log('Location protocol:', window.location.protocol);
            console.log('Location hostname:', window.location.hostname);

            if ('serial' in navigator) {
                console.log('Web Serial API is available!');
                setSupportsWebSerial(true);
                addLog('Web Serial API detected - web flashing available', 'success');
            } else {
                console.log('Web Serial API is NOT available');
                const isChrome = /Chrome/.test(navigator.userAgent) && /Google Inc/.test(navigator.vendor);
                const chromeVersion = navigator.userAgent.match(/Chrome\/(\d+)/)?.[1];

                addLog(`Web Serial API not available. Chrome: ${isChrome}, Version: ${chromeVersion || 'unknown'}`, 'error');
                addLog(`Secure context: ${window.isSecureContext}, Protocol: ${window.location.protocol}`, 'info');

                if (!window.isSecureContext && window.location.protocol !== 'https:' && window.location.hostname !== 'localhost') {
                    addLog('Web Serial API requires HTTPS or localhost', 'error');
                }
            }
        };

        checkWebSerialSupport();
    }, []);

    React.useEffect(() => {
        // Auto-scroll log
        if (logRef.current) {
            logRef.current.scrollTop = logRef.current.scrollHeight;
        }
    }, [log]);

    const addLog = (message, type = 'info') => {
        const timestamp = new Date().toLocaleTimeString();
        setLog(prev => [...prev, { message, type, timestamp }]);
    };

    const closePortIfOpen = async (serialPort) => {
        if (!serialPort) return;
        const isClosed = !serialPort.readable && !serialPort.writable;

        if (isClosed) {
            return;
        }

        try {
            await serialPort.close();
        } catch (error) {
            if (error.name !== 'InvalidStateError') {
                throw error;
            }
        }
    };

    const connectToDevice = async () => {
        try {
            addLog('Requesting device connection...', 'info');

            // Request serial port
            const newPort = await navigator.serial.requestPort();

            // Basic sanity check: open and immediately close to ensure the port is available
            try {
                await newPort.open({
                    baudRate: 115200,
                    dataBits: 8,
                    parity: 'none',
                    stopBits: 1,
                    flowControl: 'none'
                });
                await newPort.close();
            } catch (portError) {
                console.error('Port initialization failed:', portError);
                addLog(`Failed to initialize device: ${portError.message}`, 'error');
                try {
                    await newPort.close();
                } catch (closeError) {
                    if (closeError.name !== 'InvalidStateError') {
                        console.error('Error closing port after initialization failure:', closeError);
                    }
                }
                return;
            }

            setPort(newPort);
            setIsConnected(true);
            addLog('Serial device ready for flashing', 'success');

        } catch (error) {
            console.error('Connection failed:', error);
            addLog(`Connection failed: ${error.message}`, 'error');
        }
    };

    const disconnect = async () => {
        if (!port) return;

        await stopSerialMonitor({ silent: true });

        try {
            await closePortIfOpen(port);
            addLog('Disconnected from device', 'info');
        } catch (error) {
            console.error('Disconnect error:', error);
            addLog(`Disconnect error: ${error.message}`, 'error');
        } finally {
            setPort(null);
            setIsConnected(false);
        }
    };

    const flashFirmware = async () => {
        if (!isConnected || !port) {
            addLog('Please connect to device first', 'error');
            return;
        }

        const requestedPlatform = config?.platform || config?.device_type;
        if (requestedPlatform && requestedPlatform !== 'esp8266') {
            addLog(`Web flashing is not yet available for ${requestedPlatform}.`, 'error');
            addLog('Use the download option and flash the binary with a platform-appropriate tool.', 'info');
            return;
        }

        try {
            await stopSerialMonitor({ silent: true });
            await closePortIfOpen(port);
        } catch (error) {
            console.error('Pre-flash port cleanup failed:', error);
            addLog(`Failed to prepare port: ${error.message}`, 'error');
            return;
        }

        setIsFlashing(true);
        setFlashProgress(0);
        setFlashStatus('Building firmware...');

        try {
            // Step 1: Compile firmware to binary
            addLog('Compiling firmware...', 'info');
            setFlashStatus('Compiling firmware...');

            const compileResponse = await fetch('/api/firmware-builder/compile', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${localStorage.getItem('token')}`
                },
                body: JSON.stringify(config)
            });

            if (!compileResponse.ok) {
                const error = await compileResponse.json();
                throw new Error(error.error || 'Failed to compile firmware');
            }

            const compiledFirmware = await compileResponse.json();
            addLog(`Firmware compiled successfully - Version: ${compiledFirmware.firmwareVersion}`, 'success');
            setFlashProgress(20);

            // Step 2: Flash to device using ESPTool
            await flashToDevice(compiledFirmware.flashFiles);

        } catch (error) {
            console.error('Flash error:', error);
            addLog(`Flash failed: ${error.message}`, 'error');
            setFlashStatus('Flash failed');
        } finally {
            setIsFlashing(false);
        }
    };

    const flashToDevice = async (flashFiles) => {
        if (!port) {
            throw new Error('Device not connected');
        }

        let transport;

        try {
            setFlashStatus('Connecting to device...');
            addLog('Initializing ESPTool...', 'info');
            setFlashProgress(25);

            transport = new Transport(port);
            await transport.connect(115200, {
                dataBits: 8,
                stopBits: 1,
                parity: 'none',
                flowControl: 'none'
            });

            const esploader = new ESPLoader({
                transport,
                baudrate: 115200,
                romBaudrate: 115200,
                debugLogging: false
            });

            setFlashStatus('Connecting to chip...');
            addLog('Connecting to device...', 'info');

            const chip = await esploader.main();

            addLog(`Connected to ${chip}`, 'success');
            setFlashProgress(35);

            setFlashStatus('Preparing flash data...');
            addLog('Preparing firmware for flashing...', 'info');

            const fileArray = flashFiles.map(file => {
                const binaryString = atob(file.data);
                const bytes = new Uint8Array(binaryString.length);
                for (let i = 0; i < binaryString.length; i++) {
                    bytes[i] = binaryString.charCodeAt(i);
                }
                return {
                    data: bytes,
                    address: file.address
                };
            });

            setFlashProgress(45);

            setFlashStatus('Erasing flash...');
            addLog('Erasing flash memory...', 'info');

            await esploader.eraseFlash();
            addLog('Flash erased', 'success');
            setFlashProgress(55);

            setFlashStatus('Writing firmware...');
            addLog('Writing firmware to flash...', 'info');

            const flashOptions = {
                fileArray,
                flashSize: 'keep',
                flashMode: 'keep',
                flashFreq: 'keep',
                eraseAll: false,
                compress: true,
                reportProgress: (fileIndex, written, total) => {
                    const progressPercent = (written / total) * 100;
                    const overallProgress = 55 + (progressPercent * 0.35);
                    setFlashProgress(overallProgress);
                    if (progressPercent % 10 === 0) {
                        addLog(`Writing: ${Math.round(progressPercent)}%`, 'info');
                    }
                }
            };

            addLog(`Writing ${fileArray[0].data.length} bytes at address 0x${fileArray[0].address.toString(16)}...`, 'info');
            await esploader.writeFlash(flashOptions);
            addLog('Firmware written successfully', 'success');

            setFlashProgress(90);

            setFlashStatus('Restarting device...');
            addLog('Resetting device...', 'info');

            await esploader.hardReset();

            setFlashProgress(100);
            setFlashStatus('Flash completed successfully!');
            addLog('Firmware flashed successfully!', 'success');
            addLog('Device should connect to WiFi and appear online shortly', 'success');
            addLog('Click "Start Serial Monitor" to view device output', 'info');
        } catch (error) {
            addLog(`Flash error: ${error.message}`, 'error');
            throw error;
        } finally {
            if (transport) {
                try {
                    await transport.disconnect();
                } catch (disconnectError) {
                    console.warn('Transport disconnect failed:', disconnectError);
                    addLog(`Warning: failed to release serial port cleanly (${disconnectError.message})`, 'error');
                } finally {
                    try {
                        await closePortIfOpen(port);
                    } catch (closeError) {
                        if (closeError.name !== 'InvalidStateError') {
                            console.error('Port close after flash failed:', closeError);
                        }
                    }
                }
            }
        }
    };

    const startSerialMonitor = async () => {
        if (!port) {
            addLog('Please connect to a device first', 'error');
            return;
        }

        if (isMonitoring) {
            addLog('Serial monitor is already running', 'info');
            return;
        }

        try {
            await port.open({ baudRate: 115200 });
        } catch (error) {
            if (error.name !== 'InvalidStateError') {
                console.error('Serial monitor error:', error);
                addLog(`Serial monitor error: ${error.message}`, 'error');
                return;
            }
            // Port already open - continue
        }

        const textDecoder = new TextDecoderStream();
        const readableStreamClosed = port.readable.pipeTo(textDecoder.writable);
        monitorStreamClosedRef.current = readableStreamClosed;

        const reader = textDecoder.readable.getReader();
        monitorReaderRef.current = reader;
        setIsMonitoring(true);
        addLog('Serial monitor started - Listening for device output...', 'info');

        (async () => {
            try {
                while (true) {
                    const { value, done } = await reader.read();
                    if (done) break;
                    if (!value) continue;

                    value.split('\n').forEach(line => {
                        if (line.trim()) {
                            addLog(`[Device] ${line.trim()}`, 'info');
                        }
                    });
                }
            } catch (error) {
                if (error.name !== 'AbortError') {
                    console.error('Serial monitor error:', error);
                    addLog(`Serial monitor error: ${error.message}`, 'error');
                }
            } finally {
                try {
                    reader.releaseLock();
                } catch (_) {
                    // ignore
                }
                monitorReaderRef.current = null;

                try {
                    await readableStreamClosed.catch(() => {});
                } catch (_) {
                    // ignore
                }
                monitorStreamClosedRef.current = null;

                try {
                    await closePortIfOpen(port);
                } catch (error) {
                    if (error.name !== 'InvalidStateError') {
                        console.error('Error closing port after monitor:', error);
                    }
                }

                setIsMonitoring(false);
            }
        })();
    };

    const stopSerialMonitor = async ({ silent = false } = {}) => {
        const hadMonitor = Boolean(monitorReaderRef.current || isMonitoring);

        if (!hadMonitor) {
            return;
        }

        if (monitorReaderRef.current) {
            try {
                await monitorReaderRef.current.cancel();
            } catch (error) {
                if (error.name !== 'AbortError') {
                    console.error('Error stopping serial monitor:', error);
                    if (!silent) {
                        addLog(`Serial monitor stop error: ${error.message}`, 'error');
                    }
                }
            }
        }

        if (monitorStreamClosedRef.current) {
            try {
                await monitorStreamClosedRef.current.catch(() => {});
            } catch (_) {
                // ignore errors from pipeline closure
            }
            monitorStreamClosedRef.current = null;
        }

        if (!silent) {
            addLog('Serial monitor stopped', 'info');
        }

        setIsMonitoring(false);
    };

    const downloadInsteadOfFlash = async () => {
        try {
            addLog('Generating firmware for download...', 'info');

            const response = await fetch('/api/firmware-builder/build', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${localStorage.getItem('token')}`
                },
                body: JSON.stringify(config)
            });

            if (response.ok) {
                const blob = await response.blob();
                const url = window.URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `${config.device_id}_firmware.zip`;
                document.body.appendChild(a);
                a.click();
                window.URL.revokeObjectURL(url);
                document.body.removeChild(a);

                addLog('Firmware downloaded successfully', 'success');
            } else {
                throw new Error('Failed to generate firmware');
            }
        } catch (error) {
            console.error('Download error:', error);
            addLog(`Download failed: ${error.message}`, 'error');
        }
    };

    if (!supportsWebSerial) {
        return (
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
                <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4">
                    <div className="p-6">
                        <div className="flex items-center space-x-3 mb-4">
                            <AlertTriangle className="w-6 h-6 text-orange-500" />
                            <h3 className="text-lg font-semibold">Browser Not Supported</h3>
                        </div>
                        <div className="text-gray-600 mb-6 space-y-3">
                            <p>
                                Web-based flashing requires a browser that supports the WebSerial API.
                            </p>
                            <div className="bg-gray-50 p-4 rounded-lg text-sm">
                                <p className="font-semibold text-gray-800 mb-2">To enable web flashing:</p>
                                <ul className="list-disc list-inside space-y-1">
                                    <li>Use Chrome 89+ or Edge 89+ (You appear to be using Chrome {navigator.userAgent.match(/Chrome\/(\d+)/)?.[1] || 'unknown'})</li>
                                    <li>Access the site via HTTPS or localhost</li>
                                    <li>Enable "Experimental Web Platform features" in chrome://flags</li>
                                    <li>Restart your browser after enabling the flag</li>
                                </ul>
                            </div>
                            <p className="text-sm">
                                Current context: {window.isSecureContext ? '✅ Secure (HTTPS/localhost)' : '❌ Not secure'} |
                                Protocol: {window.location.protocol} |
                                WebSerial: {'serial' in navigator ? '✅ Available' : '❌ Not available'}
                            </p>
                        </div>
                        <div className="flex space-x-3">
                            <button
                                onClick={() => window.location.reload()}
                                className="px-4 py-2 text-green-600 border border-green-600 rounded-lg hover:bg-green-50"
                            >
                                Retry Detection
                            </button>
                            <button
                                onClick={downloadInsteadOfFlash}
                                className="flex-1 flex items-center justify-center space-x-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                            >
                                <Download className="w-4 h-4" />
                                <span>Download Firmware</span>
                            </button>
                            <button
                                onClick={onClose}
                                className="px-4 py-2 text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50"
                            >
                                Cancel
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[90vh] overflow-hidden">
                <div className="px-6 py-4 border-b border-gray-200">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-3">
                            <Zap className="w-6 h-6 text-blue-600" />
                            <h3 className="text-lg font-semibold">Web Flasher</h3>
                        </div>
                        <button
                            onClick={onClose}
                            className="text-gray-400 hover:text-gray-600"
                            disabled={isFlashing}
                        >
                            ✕
                        </button>
                    </div>
                </div>

                <div className="p-6 space-y-6">
                    {/* Connection Status */}
                    <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                        <div className="flex items-center space-x-3">
                            <div className={`w-3 h-3 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-500'}`}></div>
                            <span className="text-sm font-medium">
                                {isConnected ? 'Connected to device' : 'Not connected'}
                            </span>
                        </div>
                        {!isConnected ? (
                            <button
                                onClick={connectToDevice}
                                disabled={isFlashing}
                                className="flex items-center space-x-2 px-3 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:opacity-50"
                            >
                                <Usb className="w-4 h-4" />
                                <span>Connect Device</span>
                            </button>
                        ) : (
                            <button
                                onClick={disconnect}
                                disabled={isFlashing}
                                className="px-3 py-2 text-red-600 border border-red-600 text-sm rounded-lg hover:bg-red-50 disabled:opacity-50"
                            >
                                Disconnect
                            </button>
                        )}
                    </div>

                    {/* Flash Progress */}
                    {isFlashing && (
                        <div className="space-y-2">
                            <div className="flex items-center justify-between">
                                <span className="text-sm font-medium">{flashStatus}</span>
                                <span className="text-sm text-gray-500">{flashProgress}%</span>
                            </div>
                            <div className="w-full bg-gray-200 rounded-full h-2">
                                <div
                                    className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                                    style={{ width: `${flashProgress}%` }}
                                ></div>
                            </div>
                        </div>
                    )}

                    {/* Console Log */}
                    <div className="space-y-2">
                        <div className="flex items-center justify-between">
                            <h4 className="text-sm font-medium">Console Output</h4>
                            <button
                                onClick={() => setLog([])}
                                className="text-xs text-gray-500 hover:text-gray-700"
                            >
                                Clear
                            </button>
                        </div>
                        <div
                            ref={logRef}
                            className="h-48 bg-gray-900 text-green-400 text-xs p-3 rounded-lg font-mono overflow-y-auto"
                        >
                            {log.length === 0 ? (
                                <div className="text-gray-500">Console output will appear here...</div>
                            ) : (
                                log.map((entry, index) => (
                                    <div key={index} className="mb-1">
                                        <span className="text-gray-500">[{entry.timestamp}]</span>{' '}
                                        <span className={`
                                            ${entry.type === 'error' ? 'text-red-400' : ''}
                                            ${entry.type === 'success' ? 'text-green-400' : ''}
                                            ${entry.type === 'device' ? 'text-yellow-400' : ''}
                                        `}>
                                            {entry.message}
                                        </span>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>

                    {/* Instructions */}
                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                        <div className="flex items-start space-x-3">
                            <AlertTriangle className="w-5 h-5 text-blue-500 mt-0.5" />
                            <div className="text-sm">
                                <h4 className="font-medium text-blue-800 mb-1">Before Flashing:</h4>
                                <ol className="text-blue-700 space-y-1 list-decimal list-inside">
                                    <li>Connect your device to your computer via USB</li>
                                    <li>Install the CP210x or CH340 USB driver if needed</li>
                                    <li>Hold the FLASH button while clicking "Connect Device"</li>
                                    <li>Release the FLASH button after connection is established</li>
                                </ol>
                            </div>
                        </div>
                    </div>

                    {/* Action Buttons */}
                    <div className="flex space-x-3">
                        <button
                            onClick={flashFirmware}
                            disabled={!isConnected || isFlashing}
                            className="flex-1 flex items-center justify-center space-x-2 px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {isFlashing ? (
                                <>
                                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                                    <span>Flashing...</span>
                                </>
                            ) : (
                                <>
                                    <Upload className="w-4 h-4" />
                                    <span>Flash Firmware</span>
                                </>
                            )}
                        </button>
                        {flashProgress === 100 && !isFlashing && (
                            <button
                                onClick={isMonitoring ? stopSerialMonitor : startSerialMonitor}
                                className={`px-4 py-3 flex items-center space-x-2 border rounded-lg ${
                                    isMonitoring
                                        ? 'text-red-600 border-red-600 hover:bg-red-50'
                                        : 'text-green-600 border-green-600 hover:bg-green-50'
                                }`}
                            >
                                <Usb className="w-4 h-4" />
                                <span>{isMonitoring ? 'Stop Monitor' : 'Serial Monitor'}</span>
                            </button>
                        )}
                        <button
                            onClick={downloadInsteadOfFlash}
                            disabled={isFlashing}
                            className="px-4 py-3 text-blue-600 border border-blue-600 rounded-lg hover:bg-blue-50 disabled:opacity-50"
                        >
                            <Download className="w-4 h-4" />
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default WebFlasher;
