import React, { useState, useRef } from 'react';
import { Zap, Download, AlertTriangle, CheckCircle, Upload, Usb } from 'lucide-react';
import { ESPLoader, Transport } from 'esptool-js';
import { useTranslation } from 'react-i18next';
import { apiService } from '../services/api';

const WebFlasher = ({ config, onClose }) => {
    const { t } = useTranslation();
    const [isFlashing, setIsFlashing] = useState(false);
    const [flashProgress, setFlashProgress] = useState(0);
    const [flashStatus, setFlashStatus] = useState('');
    const [isConnected, setIsConnected] = useState(false);
    const [isConnecting, setIsConnecting] = useState(false);
    const [port, setPort] = useState(null);
    const [log, setLog] = useState([]);
    const [supportsWebSerial, setSupportsWebSerial] = useState(false);
    const [isMonitoring, setIsMonitoring] = useState(false);

    const logRef = useRef(null);
    const monitorReaderRef = useRef(null);
    const monitorStreamClosedRef = useRef(null);
    const transportRef = useRef(null);
    const portRef = useRef(null);
    const componentActiveRef = useRef(true);

    const DEFAULT_BAUD_RATE = 115200;
    const FALLBACK_BAUD_RATE = 74880;
    const MAX_CONNECT_WINDOW_MS = 60_000;
    const STUB_VERIFY_TIMEOUT_MS = 1_000;
    const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));
    const latin1Decoder = typeof TextDecoder !== 'undefined'
        ? new TextDecoder('latin1')
        : null;
    const flashProgressLogRef = useRef({});

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
                logMessage('apiDetected', 'success');
            } else {
                console.log('Web Serial API is NOT available');
                const isChrome = /Chrome/.test(navigator.userAgent) && /Google Inc/.test(navigator.vendor);
                const chromeVersion = navigator.userAgent.match(/Chrome\/(\d+)/)?.[1];

                logMessage('apiUnavailable', 'error', {
                    isChrome: isChrome ? t('common.yes') : t('common.no'),
                    version: chromeVersion || 'unknown'
                });
                logMessage('contextInfo', 'info', {
                    secure: window.isSecureContext ? t('common.yes') : t('common.no'),
                    protocol: window.location.protocol
                });

                if (!window.isSecureContext && window.location.protocol !== 'https:' && window.location.hostname !== 'localhost') {
                    logMessage('requiresSecureContext', 'error');
                }
            }
        };

        checkWebSerialSupport();
    }, []);

    React.useEffect(() => {
        return () => {
            componentActiveRef.current = false;
            (async () => {
                try {
                    await stopSerialMonitor({ silent: true });
                } catch (_) {
                    // best-effort cleanup
                }
                try {
                    await closePortIfOpen(portRef.current);
                } catch (_) {
                    // ignore cleanup errors on unmount
                }
            })();
        };
    }, []);

    React.useEffect(() => {
        portRef.current = port;
    }, [port]);

    React.useEffect(() => {
        // Auto-scroll log
        if (logRef.current) {
            logRef.current.scrollTop = logRef.current.scrollHeight;
        }
    }, [log]);

    const addLog = (message, type = 'info') => {
        if (!componentActiveRef.current) return;
        const timestamp = new Date().toLocaleTimeString();
        setLog(prev => [...prev, { message, type, timestamp }]);
    };

    const logMessage = (key, type = 'info', values) => {
        addLog(t(`webFlasher.log.${key}`, values), type);
    };

    React.useEffect(() => {
        if (!('serial' in navigator)) {
            return;
        }

        const handleConnect = (event) => {
            if (!componentActiveRef.current) return;
            try {
                logMessage('deviceAttached', 'info');
                ensurePortReady();
            } catch (error) {
                console.warn('Serial connect handler error:', error);
            }
        };

        const handleDisconnect = async (event) => {
            const disconnectedPort = event?.port;
            const currentPort = portRef.current;
            const isCurrentPort = disconnectedPort && currentPort &&
                getPortIdentifier(disconnectedPort) === getPortIdentifier(currentPort);

            if (!componentActiveRef.current) return;

            if (isCurrentPort) {
                logMessage('deviceDetached', 'warning');
                await stopSerialMonitor({ silent: true });
                try {
                    await closePortIfOpen(currentPort);
                } catch (error) {
                    console.warn('Error closing port after disconnect event:', error);
                }
                if (componentActiveRef.current) {
                    portRef.current = null;
                    setPort(null);
                    setIsConnected(false);
                }
            } else {
                logMessage('otherDeviceDetached', 'info');
            }
        };

        navigator.serial.addEventListener('connect', handleConnect);
        navigator.serial.addEventListener('disconnect', handleDisconnect);

        return () => {
            navigator.serial.removeEventListener('connect', handleConnect);
            navigator.serial.removeEventListener('disconnect', handleDisconnect);
        };
    }, []);

    const closePortIfOpen = async (serialPort) => {
        if (!serialPort) return;

        const isClosed = !serialPort.readable && !serialPort.writable;
        if (isClosed) {
            return;
        }

        const waitForStreamRelease = async () => {
            for (let attempt = 0; attempt < 5; attempt++) {
                const lockedReadable = serialPort.readable?.locked;
                const lockedWritable = serialPort.writable?.locked;

                if (!lockedReadable && !lockedWritable) {
                    return;
                }

                await wait(150);
            }
        };

        try {
            if (serialPort.readable?.locked || serialPort.writable?.locked) {
                logMessage('portBusyRelease', 'warning');

                if (monitorReaderRef.current) {
                    try {
                        await monitorReaderRef.current.cancel();
                    } catch (monitorErr) {
                        if (monitorErr.name !== 'AbortError') {
                            console.warn('Monitor cancel failed:', monitorErr);
                        }
                    } finally {
                        try {
                            monitorReaderRef.current.releaseLock?.();
                        } catch (_) {
                            // ignore release errors
                        }
                        monitorReaderRef.current = null;
                    }
                }
                if (monitorStreamClosedRef.current) {
                    try {
                        await monitorStreamClosedRef.current.catch(() => { });
                    } catch (_) {
                        // ignore errors from monitor stream closure
                    }
                    monitorStreamClosedRef.current = null;
                }

                if (transportRef.current && typeof transportRef.current.disconnect === 'function') {
                    try {
                        await transportRef.current.disconnect();
                    } catch (disconnectError) {
                        console.warn('Transport disconnect during close failed:', disconnectError);
                    } finally {
                        transportRef.current = null;
                    }
                }

                await waitForStreamRelease();
            }

            await serialPort.close();
            transportRef.current = null;
        } catch (error) {
            const isLockedStream = error.name === 'InvalidStateError' || error.message?.includes('Cannot cancel a locked stream');

            if (isLockedStream) {
                await waitForStreamRelease();

                try {
                    await serialPort.close();
                    transportRef.current = null;
                    return;
                } catch (retryError) {
                    const stillLocked = retryError.name === 'InvalidStateError' || retryError.message?.includes('Cannot cancel a locked stream');

                    if (stillLocked) {
                        transportRef.current = null;
                        throw new Error('Serial port is still in use. Please disconnect other applications or unplug and reconnect the device.');
                    }

                    throw retryError;
                }
            }

            throw error;
        }
    };

    const getPortIdentifier = (serialPort) => {
        if (!serialPort?.getInfo) {
            return null;
        }
        const info = serialPort.getInfo();
        if (!info) return null;
        const vendor = info.usbVendorId ?? 'unknownVendor';
        const product = info.usbProductId ?? 'unknownProduct';
        return `${vendor}:${product}`;
    };

    const pingSerialPort = async (serialPort) => {
        if (!serialPort) return;

        let openedForPing = false;
        try {
            if (!serialPort.readable && !serialPort.writable) {
                await serialPort.open({
                    baudRate: DEFAULT_BAUD_RATE,
                    dataBits: 8,
                    stopBits: 1,
                    parity: 'none',
                    flowControl: 'none'
                });
                openedForPing = true;
            }

            if (typeof serialPort.setSignals === 'function') {
                await serialPort.setSignals({ dataTerminalReady: false, requestToSend: false });
                await wait(25);
                await serialPort.setSignals({ dataTerminalReady: true, requestToSend: true });
                await wait(25);
                await serialPort.setSignals({ dataTerminalReady: false, requestToSend: false });
            }
        } catch (error) {
            if (error.name !== 'InvalidStateError' && !error.message?.includes('closed')) {
                throw error;
            }
        } finally {
            if (openedForPing) {
                try {
                    await serialPort.close();
                } catch (error) {
                    if (error.name !== 'InvalidStateError') {
                        console.warn('Ping port close failed:', error);
                    }
                }
            }
        }
    };

    const ensurePortReady = async () => {
        if (!('serial' in navigator)) {
            return;
        }

        try {
            const availablePorts = await navigator.serial.getPorts();
            if (!availablePorts || availablePorts.length === 0) {
                return;
            }

            const currentPort = portRef.current;
            const currentId = getPortIdentifier(currentPort);

            let matchingPort = currentId
                ? availablePorts.find(portCandidate => getPortIdentifier(portCandidate) === currentId)
                : null;

            if (!matchingPort && availablePorts.length === 1) {
                matchingPort = availablePorts[0];
            }

            if (!matchingPort) {
                return;
            }

            if ((!currentPort || matchingPort !== currentPort) && componentActiveRef.current) {
                portRef.current = matchingPort;
                setPort(matchingPort);
                setIsConnected(true);
                logMessage('reusingAuthorizedDevice', 'info');
            }

            await pingSerialPort(matchingPort);
            logMessage('readyCheckSuccess', 'info');
        } catch (error) {
            console.warn('Serial readiness check failed:', error);
            logMessage('readyCheckFailed', 'warning', { message: error.message });
        }
    };

    const verifyStubAlive = async (esploaderInstance) => {
        if (!esploaderInstance) {
            return false;
        }

        try {
            await Promise.race([
                esploaderInstance.readReg(esploaderInstance.CHIP_DETECT_MAGIC_REG_ADDR),
                wait(STUB_VERIFY_TIMEOUT_MS).then(() => {
                    throw new Error('Stub verification timeout');
                })
            ]);
            logMessage('stubHeartbeat', 'info');
            return true;
        } catch (error) {
            logMessage('stubVerifyFailed', 'warning', { message: error.message });
            return false;
        }
    };

    const ensureStubAlive = async (esploaderInstance) => {
        const isStubAlive = await verifyStubAlive(esploaderInstance);
        if (isStubAlive) {
            return;
        }

        logMessage('stubRetry', 'warning');

        try {
            if (esploaderInstance) {
                esploaderInstance.syncStubDetected = false;
                esploaderInstance.IS_STUB = false;
                await esploaderInstance.runStub();
                if (esploaderInstance.romBaudrate && esploaderInstance.romBaudrate !== esploaderInstance.baudrate) {
                    await esploaderInstance.changeBaud();
                }
                const verified = await verifyStubAlive(esploaderInstance);
                if (!verified) {
                    throw new Error('No response after stub re-upload');
                }
                logMessage('stubRestarted', 'success');
            }
        } catch (error) {
            throw new Error(`Stub verification failed: ${error.message}`);
        }
    };

    const registerDeviceRecord = async () => {
        if (!config?.device_id) {
            logMessage('registrationSkipped', 'warning');
            return;
        }

        const devicePayload = {
            id: config.device_id,
            name: config.device_name || config.device_id,
            device_type: config.platform || config.device_type || 'esp8266',
            wifi_ssid: config.wifi_ssid || '',
            wifi_password: config.open_wifi ? '' : (config.wifi_password || '')
        };

        let locationId = config.location_id ?? null;

        try {
            if (!locationId && config.device_location) {
                try {
                    const locationsResponse = await apiService.getLocations();
                    const locations = locationsResponse?.locations || [];
                    const existingLocation = locations.find(loc => loc.name?.toLowerCase() === config.device_location.toLowerCase());

                    if (existingLocation) {
                        locationId = existingLocation.id;
                    } else {
                        const createdLocation = await apiService.createLocation({
                            name: config.device_location,
                            description: `Auto-created from web flasher for ${devicePayload.name}`
                        });
                        locationId = createdLocation?.location?.id || createdLocation?.id || null;
                        if (locationId) {
                            logMessage('locationCreated', 'success', { name: config.device_location });
                        }
                    }
                } catch (locationError) {
                    console.warn('Location lookup/creation failed:', locationError);
                    logMessage('locationFailed', 'warning', { message: locationError.message });
                }
            }

            if (locationId) {
                devicePayload.location_id = locationId;
            }

            logMessage('registrationStarted', 'info');
            await apiService.createDevice(devicePayload);
            logMessage('registrationSucceeded', 'success');

            // Register sensors if configured
            if (config.sensors && config.sensors.length > 0) {
                logMessage('registeringSensors', 'info');
                await registerDeviceSensors(config.device_id, config.sensors, config.platform || 'esp8266');
                logMessage('sensorsRegistered', 'success', { count: config.sensors.length });
            }
        } catch (error) {
            if (error?.response?.status === 409) {
                logMessage('registrationExists', 'info');

                // Even if device exists, try to update/add sensors
                if (config.sensors && config.sensors.length > 0) {
                    try {
                        logMessage('updatingSensors', 'info');
                        await registerDeviceSensors(config.device_id, config.sensors, config.platform || 'esp8266');
                        logMessage('sensorsUpdated', 'success', { count: config.sensors.length });
                    } catch (sensorError) {
                        console.warn('Sensor update failed:', sensorError);
                        logMessage('sensorUpdateFailed', 'warning');
                    }
                }
                return;
            }

            console.error('Device registration failed:', error);
            throw new Error(t('webFlasher.errors.registrationFailed', { message: error?.response?.data?.error || error.message }));
        }
    };

    const registerDeviceSensors = async (deviceId, sensors, platform) => {
        if (!sensors || sensors.length === 0) return;

        try {
            // Get sensor types from backend
            const sensorTypesResponse = await apiService.getSensorTypes();
            const sensorTypes = sensorTypesResponse?.sensor_types || sensorTypesResponse || [];

            for (const sensor of sensors) {
                if (!sensor.enabled) continue;

                // Find matching sensor type
                const sensorType = sensorTypes.find(st =>
                    st.name.toLowerCase() === sensor.type.toLowerCase() ||
                    st.name.toLowerCase() === sensor.name?.toLowerCase()
                );

                if (!sensorType) {
                    console.warn(`Sensor type not found: ${sensor.type}`);
                    continue;
                }

                // Normalize pin for ESP8266 analog sensors
                let pin = sensor.pin;
                if (platform === 'esp8266' && ['light', 'sound', 'gas', 'photodiode'].includes(sensor.type.toLowerCase())) {
                    pin = 'A0';
                }

                // Create or update sensor
                try {
                    await apiService.createSensor(deviceId, {
                        sensor_type_id: sensorType.id,
                        pin: String(pin),
                        name: sensor.name || sensor.type,
                        enabled: true,
                        calibration_offset: sensor.calibration_offset || sensor.light_calibration_offset || 0,
                        calibration_multiplier: sensor.calibration_multiplier || sensor.light_calibration_multiplier || 1
                    });
                } catch (sensorError) {
                    // Sensor might already exist, try to update it
                    if (sensorError?.response?.status === 409) {
                        console.log(`Sensor already exists on pin ${pin}, updating...`);
                        // Note: We'd need the sensor ID to update, so we'll skip if it already exists
                    } else {
                        console.error(`Failed to register sensor ${sensor.name}:`, sensorError);
                    }
                }
            }
        } catch (error) {
            console.error('Failed to register sensors:', error);
            throw error;
        }
    };

    const prepareBootloaderEntry = async (serialPort) => {
        if (!serialPort || typeof serialPort.setSignals !== 'function') {
            return;
        }

        let openedForPrep = false;
        try {
            if (!serialPort.readable && !serialPort.writable) {
                await serialPort.open({
                    baudRate: DEFAULT_BAUD_RATE,
                    dataBits: 8,
                    stopBits: 1,
                    parity: 'none',
                    flowControl: 'none'
                });
                openedForPrep = true;
            }

            // Mimic esptool ClassicReset sequence: D0|R1|W100|D1|R0|W120|D0
            await serialPort.setSignals({ dataTerminalReady: false, requestToSend: true });
            await wait(120);
            await serialPort.setSignals({ dataTerminalReady: true, requestToSend: false });
            await wait(120);
            await serialPort.setSignals({ dataTerminalReady: false, requestToSend: false });
            await wait(80);
        } catch (error) {
            console.warn('Bootloader preparation failed:', error);
        } finally {
            if (openedForPrep) {
                try {
                    await serialPort.close();
                } catch (closeError) {
                    if (closeError.name !== 'InvalidStateError') {
                        console.warn('Bootloader prep close failed:', closeError);
                    }
                }
            }
        }
    };

    React.useEffect(() => {
        if (!supportsWebSerial) {
            return;
        }
        ensurePortReady();
    }, [supportsWebSerial]);

    const connectToDevice = async () => {
        if (isConnecting || isConnected) {
            logMessage('alreadyConnecting', 'warning');
            return;
        }

        try {
            setIsConnecting(true);
            logMessage('requestingDevice', 'info');

            // Request serial port - don't open it yet, just get the permission
            const newPort = await navigator.serial.requestPort();

            // Store the port reference without opening it
            // The port will be opened by the Transport layer during flashing
            setPort(newPort);
            setIsConnected(true);
            portRef.current = newPort;
            logMessage('deviceReady', 'success');

        } catch (error) {
            console.error('Connection failed:', error);
            logMessage('connectionFailed', 'error', { message: error.message });
        } finally {
            setIsConnecting(false);
        }
    };

    const disconnect = async () => {
        if (!port) return;

        await stopSerialMonitor({ silent: true });

        try {
            await closePortIfOpen(port);
            logMessage('deviceDisconnected', 'info');
        } catch (error) {
            console.error('Disconnect error:', error);
            logMessage('disconnectError', 'error', { message: error.message });
        } finally {
            setPort(null);
            setIsConnected(false);
            portRef.current = null;
        }
    };

    const flashFirmware = async () => {
        let activePort = portRef.current || port;

        if (!activePort) {
            await ensurePortReady();
            activePort = portRef.current;
        }

        if (!activePort) {
            logMessage('promptConnect', 'error');
            return;
        }

        if (activePort && activePort !== port && componentActiveRef.current) {
            setPort(activePort);
            setIsConnected(true);
        }

        const requestedPlatform = config?.platform || config?.device_type;
        if (requestedPlatform && requestedPlatform !== 'esp8266') {
            logMessage('unsupportedPlatform', 'error', { platform: requestedPlatform });
            logMessage('useDownloadOption', 'info');
            return;
        }

        try {
            await stopSerialMonitor({ silent: true });
            await closePortIfOpen(activePort);
            await ensurePortReady();
            activePort = portRef.current || activePort;
        } catch (error) {
            console.error('Pre-flash port cleanup failed:', error);
            logMessage('preparePortFailed', 'error', { message: error.message });
            return;
        }

        setIsFlashing(true);
        setFlashProgress(0);
        setFlashStatus(t('webFlasher.status.building'));

        try {
            // Step 1: Compile firmware to binary
            logMessage('compiling', 'info');
            setFlashStatus(t('webFlasher.status.compiling'));

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
                throw new Error(error.error || t('webFlasher.errors.compileFailed'));
            }

            const compiledFirmware = await compileResponse.json();
            logMessage('compileSuccess', 'success', { version: compiledFirmware.firmwareVersion });
            setFlashProgress(20);

            // Step 2: Flash to device using ESPTool
            await flashToDevice(compiledFirmware.flashFiles);

        } catch (error) {
            console.error('Flash error:', error);
            logMessage('flashFailed', 'error', { message: error.message });
            setFlashStatus(t('webFlasher.status.failed'));
        } finally {
            setIsFlashing(false);
        }
    };

    const flashToDevice = async (flashFiles) => {
        const activePort = portRef.current || port;
        if (!activePort) {
            throw new Error(t('webFlasher.errors.deviceDisconnected'));
        }

        let transport;

        try {
            await closePortIfOpen(activePort);

            setFlashStatus(t('webFlasher.status.connectingDevice'));
            logMessage('initializing', 'info');
            setFlashProgress(25);

            transport = new Transport(activePort);
            transportRef.current = transport;

            const connectToChip = async () => {
                const maxAttempts = 5;
                const connectionStart = Date.now();
                let romBaudrate = DEFAULT_BAUD_RATE;
                let loweredBaud = false;
                let lastError = null;

                for (let attempt = 1; attempt <= maxAttempts; attempt++) {
                    const elapsed = Date.now() - connectionStart;
                    if (!loweredBaud && elapsed > MAX_CONNECT_WINDOW_MS) {
                        loweredBaud = true;
                        romBaudrate = FALLBACK_BAUD_RATE;
                        logMessage('fallbackBaud', 'warning', { baud: FALLBACK_BAUD_RATE });
                    }

                    if (attempt === 1) {
                        logMessage('prepareBootloader', 'info');
                    }
                    await prepareBootloaderEntry(activePort);
                    transportRef.current = transport;
                    const esploaderInstance = new ESPLoader({
                        transport,
                        baudrate: DEFAULT_BAUD_RATE,
                        romBaudrate,
                        debugLogging: false
                    });

                    try {
                        setFlashStatus(t('webFlasher.status.connectingChip'));
                        const connectKey = attempt > 1 ? 'connectingDeviceRetry' : 'connectingDevice';
                        logMessage(connectKey, 'info', { attempt });

                        const chipName = await esploaderInstance.main('classic_reset');
                        logMessage('serialEstablished', 'success');
                        logMessage('chipConnected', 'success', { name: chipName });
                        setFlashProgress(35);

                        await ensureStubAlive(esploaderInstance);

                        return { esploaderInstance, chipName, romBaudrate, loweredBaud };
                    } catch (error) {
                        lastError = error;
                        const alreadyOpen = error.name === 'InvalidStateError' ||
                            error.message?.includes('already open');
                        const connectFailed = typeof error.message === 'string' && error.message.includes('Failed to connect');
                        const recoverable = alreadyOpen || connectFailed;

                        if (!recoverable) {
                            throw error;
                        }

                        if (attempt === maxAttempts) {
                            throw new Error(t('webFlasher.errors.maxRetries', { message: error.message }));
                        }

                        const remaining = maxAttempts - attempt;
                        logMessage('connectionRetry', 'warning', {
                            attempt,
                            message: error.message || String(error),
                            delay: Math.min(400 * attempt, 2000),
                            remaining
                        });

                        try {
                            await transport.disconnect();
                        } catch (disconnectError) {
                            console.warn('Transport disconnect during retry failed:', disconnectError);
                        }

                        await closePortIfOpen(activePort);
                        await wait(Math.min(400 * attempt, 2000));
                    }
                }

                const finalMessage = lastError?.message || lastError || 'Failed to establish serial connection.';
                if (lastError?.stack) {
                    console.warn('Final connection error stack:', lastError);
                }
                throw new Error(finalMessage);
            };

            const { esploaderInstance: esploader, chipName: chip, romBaudrate, loweredBaud } = await connectToChip();

            if (loweredBaud) {
                logMessage('fallbackBaudSuccess', 'info', { baud: romBaudrate });
            }

            setFlashStatus(t('webFlasher.status.preparingData'));
            logMessage('preparingFirmware', 'info');

            const fileArray = flashFiles.map(file => {
                const toBinaryString = (input) => {
                    const decodeUint8 = (uint8Array) => {
                        if (latin1Decoder) {
                            return latin1Decoder.decode(uint8Array);
                        }
                        let result = '';
                        const chunkSize = 0x8000;
                        for (let offset = 0; offset < uint8Array.length; offset += chunkSize) {
                            const chunk = uint8Array.subarray(offset, Math.min(offset + chunkSize, uint8Array.length));
                            result += String.fromCharCode.apply(null, chunk);
                        }
                        return result;
                    };

                    if (typeof input === 'string') {
                        try {
                            return atob(input);
                        } catch (error) {
                            // already binary string
                            return input;
                        }
                    }
                    if (input instanceof Uint8Array) {
                        return decodeUint8(input);
                    }
                    if (Array.isArray(input)) {
                        return decodeUint8(Uint8Array.from(input));
                    }
                    if (input instanceof ArrayBuffer) {
                        return decodeUint8(new Uint8Array(input));
                    }
                    throw new Error('Unsupported firmware data format received from compiler');
                };

                return {
                    data: toBinaryString(file.data),
                    address: file.address
                };
            });

            setFlashProgress(45);

            setFlashStatus(t('webFlasher.status.erasing'));
            logMessage('erasing', 'info');

            await esploader.eraseFlash();
            logMessage('eraseComplete', 'success');
            setFlashProgress(55);

            setFlashStatus(t('webFlasher.status.writing'));
            logMessage('writing', 'info');

            flashProgressLogRef.current = {};
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
                    const bucket = Math.floor(progressPercent / 5);
                    const lastBucket = flashProgressLogRef.current[fileIndex] ?? -1;
                    if (bucket > lastBucket || progressPercent === 100) {
                        flashProgressLogRef.current[fileIndex] = bucket;
                        const humanPercent = Math.min(100, Math.round(progressPercent));
                        const writtenDisplay = Number.isFinite(written) ? written.toLocaleString() : written;
                        const totalDisplay = Number.isFinite(total) ? total.toLocaleString() : total;
                        logMessage('writingProgress', 'info', {
                            percent: humanPercent,
                            written: writtenDisplay,
                            total: totalDisplay
                        });
                    }
                }
            };

            logMessage('writingFile', 'info', {
                bytes: fileArray[0].data.length,
                address: fileArray[0].address.toString(16)
            });
            await esploader.writeFlash(flashOptions);
            flashProgressLogRef.current = {};
            logMessage('writeComplete', 'success');

            setFlashProgress(90);

            setFlashStatus(t('webFlasher.status.restarting'));
            logMessage('resetting', 'info');

            try {
                await esploader.after('hard_reset');
                logMessage('resetSignal', 'info');
            } catch (resetError) {
                console.warn('Device reset failed:', resetError);
                logMessage('resetWarning', 'warning', { message: resetError.message });
            }

            setFlashProgress(100);
            setFlashStatus(t('webFlasher.status.completed'));
            logMessage('flashComplete', 'success');

            try {
                await registerDeviceRecord();
            } catch (registrationError) {
                logMessage('registrationFailed', 'warning', { message: registrationError.message });
            }

            logMessage('postFlashOnline', 'success');
            logMessage('postFlashMonitor', 'info');
        } catch (error) {
            logMessage('flashError', 'error', { message: error.message });
            throw error;
        } finally {
            if (transport) {
                try {
                    await transport.disconnect();
                } catch (disconnectError) {
                    console.warn('Transport disconnect failed:', disconnectError);
                    logMessage('disconnectWarning', 'error', { message: disconnectError.message });
                } finally {
                    transportRef.current = null;
                    try {
                        await closePortIfOpen(activePort);
                    } catch (closeError) {
                        console.error('Port close after flash failed:', closeError);
                        logMessage('closeWarning', 'warning', { message: closeError.message });
                    }
                }
            }
        }
    };

    const startSerialMonitor = async () => {
        if (!port) {
            logMessage('promptConnect', 'error');
            return;
        }

        if (isMonitoring) {
            logMessage('monitorAlreadyRunning', 'info');
            return;
        }

        try {
            await port.open({ baudRate: DEFAULT_BAUD_RATE });
        } catch (error) {
            if (error.name !== 'InvalidStateError') {
                console.error('Serial monitor error:', error);
                logMessage('monitorError', 'error', { message: error.message });
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
        logMessage('monitorStarted', 'info');

        (async () => {
            try {
                while (true) {
                    const { value, done } = await reader.read();
                    if (done) break;
                    if (!value) continue;

                    value.split('\n').forEach(line => {
                        if (line.trim()) {
                            logMessage('deviceOutput', 'info', { line: line.trim() });
                        }
                    });
                }
            } catch (error) {
                if (error.name !== 'AbortError') {
                    console.error('Serial monitor error:', error);
                    logMessage('monitorError', 'error', { message: error.message });
                }
            } finally {
                try {
                    reader.releaseLock();
                } catch (_) {
                    // ignore
                }
                monitorReaderRef.current = null;

                try {
                    await readableStreamClosed.catch(() => { });
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

                if (componentActiveRef.current) {
                    setIsMonitoring(false);
                }
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
                        logMessage('monitorStopError', 'error', { message: error.message });
                    }
                }
            }
        }

        if (monitorStreamClosedRef.current) {
            try {
                await monitorStreamClosedRef.current.catch(() => { });
            } catch (_) {
                // ignore errors from pipeline closure
            }
            monitorStreamClosedRef.current = null;
        }

        if (!silent) {
            logMessage('monitorStopped', 'info');
        }

        if (componentActiveRef.current) {
            setIsMonitoring(false);
        }
    };

    const downloadInsteadOfFlash = async () => {
        try {
            logMessage('downloadGenerating', 'info');

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

                logMessage('downloadSuccess', 'success');
            } else {
                throw new Error(t('webFlasher.errors.downloadFailed'));
            }
        } catch (error) {
            console.error('Download error:', error);
            logMessage('downloadFailed', 'error', { message: error.message });
        }
    };

    if (!supportsWebSerial) {
        const chromeVersion = navigator.userAgent.match(/Chrome\/(\d+)/)?.[1] || 'unknown';
        const unsupportedSteps = [
            t('webFlasher.unsupported.steps.browser', { version: chromeVersion }),
            t('webFlasher.unsupported.steps.secure'),
            t('webFlasher.unsupported.steps.flags'),
            t('webFlasher.unsupported.steps.restart')
        ];
        const secureStatus = window.isSecureContext
            ? t('webFlasher.unsupported.contextSecure')
            : t('webFlasher.unsupported.contextInsecure');
        const webSerialStatus = 'serial' in navigator
            ? t('webFlasher.unsupported.webSerialAvailable')
            : t('webFlasher.unsupported.webSerialUnavailable');
        return (
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
                <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4">
                    <div className="p-6">
                        <div className="flex items-center space-x-3 mb-4">
                            <AlertTriangle className="w-6 h-6 text-orange-500" />
                            <h3 className="text-lg font-semibold">{t('webFlasher.unsupported.title')}</h3>
                        </div>
                        <div className="text-gray-600 mb-6 space-y-3">
                            <p>{t('webFlasher.unsupported.description')}</p>
                            <div className="bg-gray-50 p-4 rounded-lg text-sm">
                                <p className="font-semibold text-gray-800 mb-2">{t('webFlasher.unsupported.instructionsTitle')}</p>
                                <ul className="list-disc list-inside space-y-1">
                                    {unsupportedSteps.map((step, index) => (
                                        <li key={index}>{step}</li>
                                    ))}
                                </ul>
                            </div>
                            <p className="text-sm">
                                {t('webFlasher.unsupported.statusLine', {
                                    secure: secureStatus,
                                    protocol: window.location.protocol,
                                    webSerial: webSerialStatus
                                })}
                            </p>
                        </div>
                        <div className="flex space-x-3">
                            <button
                                onClick={() => window.location.reload()}
                                className="px-4 py-2 text-green-600 border border-green-600 rounded-lg hover:bg-green-50"
                            >
                                {t('webFlasher.buttons.retryDetection')}
                            </button>
                            <button
                                onClick={downloadInsteadOfFlash}
                                className="flex-1 flex items-center justify-center space-x-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                            >
                                <Download className="w-4 h-4" />
                                <span>{t('webFlasher.buttons.downloadFirmware')}</span>
                            </button>
                            <button
                                onClick={onClose}
                                className="px-4 py-2 text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50"
                            >
                                {t('common.cancel')}
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
                            <h3 className="text-lg font-semibold">{t('webFlasher.title')}</h3>
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
                                {isConnected ? t('webFlasher.connection.connected') : t('webFlasher.connection.disconnected')}
                            </span>
                        </div>
                        {!isConnected ? (
                            <button
                                onClick={connectToDevice}
                                disabled={isFlashing || isConnecting}
                                className="flex items-center space-x-2 px-3 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:opacity-50"
                            >
                                <Usb className="w-4 h-4" />
                                <span>{isConnecting ? t('webFlasher.connection.connecting') : t('webFlasher.buttons.connect')}</span>
                            </button>
                        ) : (
                            <button
                                onClick={disconnect}
                                disabled={isFlashing}
                                className="px-3 py-2 text-red-600 border border-red-600 text-sm rounded-lg hover:bg-red-50 disabled:opacity-50"
                            >
                                {t('webFlasher.buttons.disconnect')}
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
                            <h4 className="text-sm font-medium">{t('webFlasher.console.title')}</h4>
                            <button
                                onClick={() => setLog([])}
                                className="text-xs text-gray-500 hover:text-gray-700"
                            >
                                {t('webFlasher.console.clear')}
                            </button>
                        </div>
                        <div
                            ref={logRef}
                            className="h-48 bg-gray-900 text-green-400 text-xs p-3 rounded-lg font-mono overflow-y-auto"
                        >
                            {log.length === 0 ? (
                                <div className="text-gray-500">{t('webFlasher.console.empty')}</div>
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
                                <h4 className="font-medium text-blue-800 mb-1">{t('webFlasher.instructions.title')}</h4>
                                <ol className="text-blue-700 space-y-1 list-decimal list-inside">
                                    <li>{t('webFlasher.instructions.step1')}</li>
                                    <li>{t('webFlasher.instructions.step2')}</li>
                                    <li>{t('webFlasher.instructions.step3')}</li>
                                    <li>{t('webFlasher.instructions.step4')}</li>
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
                                    <span>{t('webFlasher.buttons.flashing')}</span>
                                </>
                            ) : (
                                <>
                                    <Upload className="w-4 h-4" />
                                    <span>{t('webFlasher.buttons.flash')}</span>
                                </>
                            )}
                        </button>
                        {flashProgress === 100 && !isFlashing && (
                            <button
                                onClick={isMonitoring ? stopSerialMonitor : startSerialMonitor}
                                className={`px-4 py-3 flex items-center space-x-2 border rounded-lg ${isMonitoring
                                        ? 'text-red-600 border-red-600 hover:bg-red-50'
                                        : 'text-green-600 border-green-600 hover:bg-green-50'
                                    }`}
                            >
                                <Usb className="w-4 h-4" />
                                <span>{isMonitoring ? t('webFlasher.buttons.stopMonitor') : t('webFlasher.buttons.serialMonitor')}</span>
                            </button>
                        )}
                        <button
                            onClick={downloadInsteadOfFlash}
                            disabled={isFlashing}
                            className="px-4 py-3 text-blue-600 border border-blue-600 rounded-lg hover:bg-blue-50 disabled:opacity-50"
                            aria-label={t('webFlasher.buttons.downloadZip')}
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
