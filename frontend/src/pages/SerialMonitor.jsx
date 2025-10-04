import React, { useState, useRef, useEffect } from 'react';
import { Usb, Play, Square, Trash2, Download, Settings } from 'lucide-react';

const SerialMonitor = () => {
    const [isConnected, setIsConnected] = useState(false);
    const [isMonitoring, setIsMonitoring] = useState(false);
    const [port, setPort] = useState(null);
    const [reader, setReader] = useState(null);
    const [log, setLog] = useState([]);
    const [baudRate, setBaudRate] = useState(115200);
    const [autoScroll, setAutoScroll] = useState(true);
    const [showTimestamp, setShowTimestamp] = useState(true);
    const logRef = useRef(null);

    useEffect(() => {
        if (autoScroll && logRef.current) {
            logRef.current.scrollTop = logRef.current.scrollHeight;
        }
    }, [log, autoScroll]);

    const addLog = (message, type = 'device') => {
        const timestamp = new Date().toLocaleTimeString();
        setLog(prev => [...prev, { message, type, timestamp }]);
    };

    const connectToDevice = async () => {
        try {
            const selectedPort = await navigator.serial.requestPort();
            setPort(selectedPort);
            setIsConnected(true);
            addLog('Device connected successfully', 'success');
        } catch (error) {
            addLog(`Connection failed: ${error.message}`, 'error');
        }
    };

    const disconnect = async () => {
        if (isMonitoring) {
            await stopMonitoring();
        }
        if (port) {
            try {
                await port.close();
            } catch (error) {
                console.error('Error closing port:', error);
            }
            setPort(null);
            setIsConnected(false);
            addLog('Device disconnected', 'info');
        }
    };

    const startMonitoring = async () => {
        if (!port || isMonitoring) return;

        try {
            await port.open({ baudRate: baudRate });
            setIsMonitoring(true);
            addLog(`Serial monitor started at ${baudRate} baud`, 'info');

            const textDecoder = new TextDecoderStream();
            const readableStreamClosed = port.readable.pipeTo(textDecoder.writable);
            const newReader = textDecoder.readable.getReader();
            setReader(newReader);

            // Read serial data
            (async () => {
                try {
                    while (true) {
                        const { value, done } = await newReader.read();
                        if (done) break;

                        // Split by newlines and add each line
                        const lines = value.split('\n');
                        lines.forEach(line => {
                            if (line.trim()) {
                                addLog(line.trim(), 'device');
                            }
                        });
                    }
                } catch (error) {
                    if (error.message.includes('cancel')) {
                        // Normal cancellation
                    } else {
                        addLog(`Read error: ${error.message}`, 'error');
                    }
                }
            })();
        } catch (error) {
            if (error.message.includes('readable is locked')) {
                addLog('Port is busy, please disconnect and reconnect device', 'error');
            } else {
                addLog(`Serial monitor error: ${error.message}`, 'error');
            }
            setIsMonitoring(false);
        }
    };

    const stopMonitoring = async () => {
        if (reader) {
            try {
                await reader.cancel();
                setReader(null);
            } catch (error) {
                console.error('Error stopping monitor:', error);
            }
        }
        if (port) {
            try {
                await port.close();
            } catch (error) {
                console.error('Error closing port:', error);
            }
        }
        setIsMonitoring(false);
        addLog('Serial monitor stopped', 'info');
    };

    const clearLog = () => {
        setLog([]);
    };

    const downloadLog = () => {
        const logText = log.map(entry => {
            const timestamp = showTimestamp ? `[${entry.timestamp}] ` : '';
            return `${timestamp}${entry.message}`;
        }).join('\n');

        const blob = new Blob([logText], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `serial-monitor-${new Date().toISOString().replace(/:/g, '-')}.txt`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    };

    const getLogColor = (type) => {
        switch (type) {
            case 'device': return 'text-gray-800';
            case 'info': return 'text-blue-600';
            case 'success': return 'text-green-600';
            case 'error': return 'text-red-600';
            case 'warning': return 'text-yellow-600';
            default: return 'text-gray-800';
        }
    };

    return (
        <div className="p-6 max-w-7xl mx-auto">
            <div className="mb-6">
                <h1 className="text-3xl font-bold text-gray-900">Serial Monitor</h1>
                <p className="text-gray-600 mt-2">Monitor serial output from your ESP8266/ESP32 devices in real-time</p>
            </div>

            <div className="bg-white rounded-lg shadow-lg overflow-hidden">
                {/* Control Panel */}
                <div className="bg-gray-50 border-b border-gray-200 p-4">
                    <div className="flex flex-wrap gap-4 items-center">
                        {/* Connection Status */}
                        <div className="flex items-center space-x-2">
                            <div className={`w-3 h-3 rounded-full ${isConnected ? 'bg-green-500' : 'bg-gray-300'}`}></div>
                            <span className="text-sm font-medium">
                                {isConnected ? 'Connected' : 'Not Connected'}
                            </span>
                        </div>

                        {/* Connect/Disconnect Button */}
                        {!isConnected ? (
                            <button
                                onClick={connectToDevice}
                                className="flex items-center space-x-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                            >
                                <Usb className="w-4 h-4" />
                                <span>Connect Device</span>
                            </button>
                        ) : (
                            <button
                                onClick={disconnect}
                                disabled={isMonitoring}
                                className="px-4 py-2 text-red-600 border border-red-600 rounded-lg hover:bg-red-50 disabled:opacity-50"
                            >
                                Disconnect
                            </button>
                        )}

                        {/* Baud Rate Selector */}
                        <div className="flex items-center space-x-2">
                            <Settings className="w-4 h-4 text-gray-600" />
                            <select
                                value={baudRate}
                                onChange={(e) => setBaudRate(Number(e.target.value))}
                                disabled={isMonitoring}
                                className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
                            >
                                <option value={9600}>9600</option>
                                <option value={19200}>19200</option>
                                <option value={38400}>38400</option>
                                <option value={57600}>57600</option>
                                <option value={115200}>115200</option>
                                <option value={230400}>230400</option>
                            </select>
                            <span className="text-sm text-gray-600">baud</span>
                        </div>

                        {/* Start/Stop Monitoring */}
                        {isConnected && (
                            <>
                                {!isMonitoring ? (
                                    <button
                                        onClick={startMonitoring}
                                        className="flex items-center space-x-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
                                    >
                                        <Play className="w-4 h-4" />
                                        <span>Start</span>
                                    </button>
                                ) : (
                                    <button
                                        onClick={stopMonitoring}
                                        className="flex items-center space-x-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700"
                                    >
                                        <Square className="w-4 h-4" />
                                        <span>Stop</span>
                                    </button>
                                )}
                            </>
                        )}

                        {/* Spacer */}
                        <div className="flex-1"></div>

                        {/* Options */}
                        <label className="flex items-center space-x-2 cursor-pointer">
                            <input
                                type="checkbox"
                                checked={showTimestamp}
                                onChange={(e) => setShowTimestamp(e.target.checked)}
                                className="rounded"
                            />
                            <span className="text-sm">Timestamps</span>
                        </label>

                        <label className="flex items-center space-x-2 cursor-pointer">
                            <input
                                type="checkbox"
                                checked={autoScroll}
                                onChange={(e) => setAutoScroll(e.target.checked)}
                                className="rounded"
                            />
                            <span className="text-sm">Auto-scroll</span>
                        </label>

                        {/* Clear Button */}
                        <button
                            onClick={clearLog}
                            className="flex items-center space-x-2 px-3 py-2 text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50"
                        >
                            <Trash2 className="w-4 h-4" />
                            <span>Clear</span>
                        </button>

                        {/* Download Button */}
                        <button
                            onClick={downloadLog}
                            disabled={log.length === 0}
                            className="flex items-center space-x-2 px-3 py-2 text-blue-600 border border-blue-600 rounded-lg hover:bg-blue-50 disabled:opacity-50"
                        >
                            <Download className="w-4 h-4" />
                            <span>Download</span>
                        </button>
                    </div>
                </div>

                {/* Log Display */}
                <div
                    ref={logRef}
                    className="bg-black text-green-400 font-mono text-sm p-4 h-[600px] overflow-y-auto"
                    style={{ fontFamily: 'Consolas, Monaco, "Courier New", monospace' }}
                >
                    {log.length === 0 ? (
                        <div className="text-gray-500 text-center mt-20">
                            <Usb className="w-16 h-16 mx-auto mb-4 opacity-50" />
                            <p>Connect a device and start monitoring to see output</p>
                        </div>
                    ) : (
                        log.map((entry, index) => (
                            <div key={index} className="mb-1">
                                {showTimestamp && (
                                    <span className="text-gray-500 mr-2">[{entry.timestamp}]</span>
                                )}
                                <span className={getLogColor(entry.type)}>{entry.message}</span>
                            </div>
                        ))
                    )}
                </div>

                {/* Status Bar */}
                <div className="bg-gray-50 border-t border-gray-200 px-4 py-2 flex justify-between items-center text-sm text-gray-600">
                    <div>
                        {isMonitoring ? (
                            <span className="flex items-center space-x-2">
                                <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                                <span>Monitoring at {baudRate} baud</span>
                            </span>
                        ) : (
                            <span>Ready</span>
                        )}
                    </div>
                    <div>
                        {log.length} line{log.length !== 1 ? 's' : ''}
                    </div>
                </div>
            </div>

            {/* Instructions */}
            <div className="mt-6 bg-blue-50 border border-blue-200 rounded-lg p-4">
                <h3 className="font-semibold text-blue-900 mb-2">How to use:</h3>
                <ol className="list-decimal list-inside space-y-1 text-blue-800 text-sm">
                    <li>Connect your ESP8266/ESP32 device via USB</li>
                    <li>Click "Connect Device" and select the serial port</li>
                    <li>Select the appropriate baud rate (usually 115200 for ESP devices)</li>
                    <li>Click "Start" to begin monitoring</li>
                    <li>View real-time serial output from your device</li>
                    <li>Use "Download" to save the log to a file</li>
                </ol>
            </div>
        </div>
    );
};

export default SerialMonitor;
