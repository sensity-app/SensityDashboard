#!/usr/bin/env python3
"""
Raspberry Pi Sensor Platform
IoT sensor monitoring and data transmission script
"""

import time
import json
import requests
import logging
from datetime import datetime
from typing import Dict, List, Optional
import signal
import sys

# GPIO libraries (commented out if not installed)
try:
    import RPi.GPIO as GPIO
    GPIO_AVAILABLE = True
except ImportError:
    print("WARNING: RPi.GPIO not available. GPIO sensors will be disabled.")
    GPIO_AVAILABLE = False

# Sensor libraries
try:
    import Adafruit_DHT
    DHT_AVAILABLE = True
except ImportError:
    print("WARNING: Adafruit_DHT not available. DHT sensors will be disabled.")
    DHT_AVAILABLE = False

try:
    import spidev
    import busio
    import digitalio
    import board
    from adafruit_mcp3xxx.mcp3008 import MCP3008
    from adafruit_mcp3xxx.analog_in import AnalogIn
    MCP3008_AVAILABLE = True
except ImportError:
    print("WARNING: MCP3008 libraries not available. Analog sensors will be disabled.")
    MCP3008_AVAILABLE = False

# Configuration (will be replaced by device_config.py)
DEVICE_ID = "{{DEVICE_ID}}"
DEVICE_NAME = "{{DEVICE_NAME}}"
DEVICE_LOCATION = "{{DEVICE_LOCATION}}"
FIRMWARE_VERSION = "{{FIRMWARE_VERSION}}"

# Network configuration
WIFI_SSID = "{{WIFI_SSID}}"
WIFI_PASSWORD = "{{WIFI_PASSWORD}}"
SERVER_URL = "{{SERVER_URL}}"
SERVER_API_KEY = "{{SERVER_API_KEY}}"

# Device behavior
HEARTBEAT_INTERVAL_SEC = {{HEARTBEAT_INTERVAL_SEC}}
SENSOR_READ_INTERVAL_MS = {{SENSOR_READ_INTERVAL_MS}}
DEBUG_MODE = {{DEBUG_MODE}}
DEVICE_ARMED = {{DEVICE_ARMED}}

# Sensor configuration
SENSOR_DHT_ENABLED = {{SENSOR_DHT_ENABLED}}
SENSOR_DHT_PIN = {{SENSOR_DHT_PIN}}
SENSOR_DHT_TYPE = {{SENSOR_DHT_TYPE}}

SENSOR_LIGHT_ENABLED = {{SENSOR_LIGHT_ENABLED}}
SENSOR_LIGHT_CHANNEL = {{SENSOR_LIGHT_CHANNEL}}

SENSOR_MOTION_ENABLED = {{SENSOR_MOTION_ENABLED}}
SENSOR_MOTION_PIN = {{SENSOR_MOTION_PIN}}

SENSOR_DISTANCE_ENABLED = {{SENSOR_DISTANCE_ENABLED}}
SENSOR_DISTANCE_TRIGGER_PIN = {{SENSOR_DISTANCE_TRIGGER_PIN}}
SENSOR_DISTANCE_ECHO_PIN = {{SENSOR_DISTANCE_ECHO_PIN}}

# Setup logging
logging.basicConfig(
    level=logging.DEBUG if DEBUG_MODE else logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

class SensorPlatform:
    def __init__(self):
        self.device_id = DEVICE_ID
        self.armed = DEVICE_ARMED
        self.running = True
        self.last_heartbeat = 0
        self.last_sensor_read = 0
        self.sensors = []

        # Initialize MCP3008 for analog sensors
        self.mcp = None
        if MCP3008_AVAILABLE:
            try:
                spi = busio.SPI(clock=board.SCK, MISO=board.MISO, MOSI=board.MOSI)
                cs = digitalio.DigitalInOut(board.D5)
                self.mcp = MCP3008(spi, cs)
                logger.info("MCP3008 ADC initialized")
            except Exception as e:
                logger.error(f"Failed to initialize MCP3008: {e}")

        # Setup GPIO
        if GPIO_AVAILABLE:
            GPIO.setmode(GPIO.BCM)
            GPIO.setwarnings(False)

        # Initialize sensors
        self.initialize_sensors()

        # Setup signal handlers
        signal.signal(signal.SIGINT, self.signal_handler)
        signal.signal(signal.SIGTERM, self.signal_handler)

    def initialize_sensors(self):
        """Initialize all enabled sensors"""
        logger.info("Initializing sensors...")

        if SENSOR_DHT_ENABLED and DHT_AVAILABLE:
            self.sensors.append({
                'type': 'temperature_humidity',
                'name': 'DHT22 Sensor',
                'pin': SENSOR_DHT_PIN,
                'dht_type': Adafruit_DHT.DHT22 if SENSOR_DHT_TYPE == 'DHT22' else Adafruit_DHT.DHT11
            })
            logger.info(f"DHT sensor initialized on GPIO {SENSOR_DHT_PIN}")

        if SENSOR_LIGHT_ENABLED and self.mcp:
            self.sensors.append({
                'type': 'light',
                'name': 'Light Sensor',
                'channel': SENSOR_LIGHT_CHANNEL,
                'adc': AnalogIn(self.mcp, getattr(MCP3008, f'P{SENSOR_LIGHT_CHANNEL}'))
            })
            logger.info(f"Light sensor initialized on MCP3008 channel {SENSOR_LIGHT_CHANNEL}")

        if SENSOR_MOTION_ENABLED and GPIO_AVAILABLE:
            GPIO.setup(SENSOR_MOTION_PIN, GPIO.IN)
            self.sensors.append({
                'type': 'motion',
                'name': 'PIR Motion Sensor',
                'pin': SENSOR_MOTION_PIN
            })
            logger.info(f"Motion sensor initialized on GPIO {SENSOR_MOTION_PIN}")

        if SENSOR_DISTANCE_ENABLED and GPIO_AVAILABLE:
            GPIO.setup(SENSOR_DISTANCE_TRIGGER_PIN, GPIO.OUT)
            GPIO.setup(SENSOR_DISTANCE_ECHO_PIN, GPIO.IN)
            self.sensors.append({
                'type': 'distance',
                'name': 'Ultrasonic Sensor',
                'trigger_pin': SENSOR_DISTANCE_TRIGGER_PIN,
                'echo_pin': SENSOR_DISTANCE_ECHO_PIN
            })
            logger.info(f"Distance sensor initialized on GPIO {SENSOR_DISTANCE_TRIGGER_PIN}/{SENSOR_DISTANCE_ECHO_PIN}")

        logger.info(f"Total sensors initialized: {len(self.sensors)}")

    def read_all_sensors(self) -> List[Dict]:
        """Read data from all sensors"""
        readings = []

        for sensor in self.sensors:
            try:
                reading = {
                    'sensor_type': sensor['type'],
                    'sensor_name': sensor['name'],
                    'timestamp': int(time.time() * 1000)
                }

                if sensor['type'] == 'temperature_humidity':
                    humidity, temperature = Adafruit_DHT.read_retry(
                        sensor['dht_type'],
                        sensor['pin']
                    )
                    if humidity is not None and temperature is not None:
                        reading['temperature'] = round(temperature, 2)
                        reading['humidity'] = round(humidity, 2)

                elif sensor['type'] == 'light':
                    adc = sensor['adc']
                    reading['value'] = adc.value
                    reading['voltage'] = round(adc.voltage, 3)
                    reading['percentage'] = round((adc.value / 65535) * 100, 1)

                elif sensor['type'] == 'motion':
                    reading['value'] = GPIO.input(sensor['pin'])
                    reading['state'] = 'detected' if reading['value'] == GPIO.HIGH else 'clear'

                elif sensor['type'] == 'distance':
                    distance = self.measure_distance(
                        sensor['trigger_pin'],
                        sensor['echo_pin']
                    )
                    reading['value'] = distance
                    reading['unit'] = 'cm'

                readings.append(reading)

            except Exception as e:
                logger.error(f"Error reading {sensor['name']}: {e}")

        return readings

    def measure_distance(self, trigger_pin: int, echo_pin: int) -> float:
        """Measure distance using HC-SR04 ultrasonic sensor"""
        # Send trigger pulse
        GPIO.output(trigger_pin, GPIO.LOW)
        time.sleep(0.00001)
        GPIO.output(trigger_pin, GPIO.HIGH)
        time.sleep(0.00001)
        GPIO.output(trigger_pin, GPIO.LOW)

        # Measure echo pulse
        pulse_start = time.time()
        pulse_end = time.time()
        timeout = time.time() + 0.1  # 100ms timeout

        while GPIO.input(echo_pin) == GPIO.LOW:
            pulse_start = time.time()
            if pulse_start > timeout:
                return -1

        while GPIO.input(echo_pin) == GPIO.HIGH:
            pulse_end = time.time()
            if pulse_end > timeout:
                return -1

        pulse_duration = pulse_end - pulse_start
        distance = (pulse_duration * 34300) / 2  # Speed of sound: 343m/s

        return round(distance, 2)

    def send_sensor_data(self, readings: List[Dict]):
        """Send sensor data to server"""
        if not readings:
            return

        try:
            payload = {
                'device_id': self.device_id,
                'data': readings
            }

            headers = {
                'Content-Type': 'application/json',
                'X-Device-ID': self.device_id,
                'X-API-Key': SERVER_API_KEY
            }

            response = requests.post(
                f"{SERVER_URL}/api/sensor-data",
                json=payload,
                headers=headers,
                timeout=10
            )

            if response.status_code == 200:
                if DEBUG_MODE:
                    logger.debug(f"Sensor data sent successfully: {response.status_code}")
            else:
                logger.error(f"Failed to send sensor data: {response.status_code}")

        except Exception as e:
            logger.error(f"Error sending sensor data: {e}")

    def send_heartbeat(self):
        """Send heartbeat to server"""
        try:
            # Get system stats
            with open('/proc/uptime', 'r') as f:
                uptime = int(float(f.read().split()[0]))

            with open('/proc/meminfo', 'r') as f:
                meminfo = f.read()
                mem_total = int([x for x in meminfo.split('\n') if 'MemTotal' in x][0].split()[1])
                mem_free = int([x for x in meminfo.split('\n') if 'MemAvailable' in x][0].split()[1])

            payload = {
                'device_id': self.device_id,
                'uptime': uptime,
                'free_memory': mem_free,
                'total_memory': mem_total,
                'sensor_count': len(self.sensors),
                'armed': self.armed
            }

            headers = {
                'Content-Type': 'application/json',
                'X-Device-ID': self.device_id,
                'X-API-Key': SERVER_API_KEY
            }

            response = requests.post(
                f"{SERVER_URL}/api/heartbeat",
                json=payload,
                headers=headers,
                timeout=10
            )

            logger.info(f"Heartbeat sent: {response.status_code}")

        except Exception as e:
            logger.error(f"Error sending heartbeat: {e}")

    def run(self):
        """Main loop"""
        logger.info(f"Starting {DEVICE_NAME} ({self.device_id})")
        logger.info(f"Firmware Version: {FIRMWARE_VERSION}")
        logger.info(f"Server URL: {SERVER_URL}")

        # Send initial heartbeat
        self.send_heartbeat()
        self.last_heartbeat = time.time()

        while self.running:
            try:
                current_time = time.time()

                # Read sensors
                if self.armed and (current_time - self.last_sensor_read) >= (SENSOR_READ_INTERVAL_MS / 1000):
                    readings = self.read_all_sensors()
                    self.send_sensor_data(readings)
                    self.last_sensor_read = current_time

                # Send heartbeat
                if (current_time - self.last_heartbeat) >= HEARTBEAT_INTERVAL_SEC:
                    self.send_heartbeat()
                    self.last_heartbeat = current_time

                time.sleep(0.1)  # 100ms loop delay

            except Exception as e:
                logger.error(f"Error in main loop: {e}")
                time.sleep(1)

    def signal_handler(self, signum, frame):
        """Handle shutdown signals"""
        logger.info("Shutdown signal received")
        self.running = False
        self.cleanup()
        sys.exit(0)

    def cleanup(self):
        """Cleanup GPIO and resources"""
        logger.info("Cleaning up...")
        if GPIO_AVAILABLE:
            GPIO.cleanup()
        logger.info("Cleanup complete")

if __name__ == "__main__":
    platform = SensorPlatform()
    platform.run()
