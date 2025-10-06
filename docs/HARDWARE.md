# 🔌 Hardware Guide

Complete hardware reference for ESP8266 IoT devices with sensor wiring diagrams, specifications, and best practices.

## 📋 Table of Contents

- [ESP8266 Overview](#esp8266-overview)
- [Supported Sensors](#supported-sensors)
- [Wiring Diagrams](#wiring-diagrams)
- [Pin Configuration](#pin-configuration)
- [Power Requirements](#power-requirements)
- [Assembly Instructions](#assembly-instructions)
- [Troubleshooting](#troubleshooting)
- [Safety Guidelines](#safety-guidelines)

---

## 🔧 ESP8266 Overview

### Recommended Boards

#### NodeMCU v3 (Recommended for Beginners)
- **Microcontroller**: ESP8266 (ESP-12E module)
- **USB**: Built-in CP2102 USB-to-UART
- **Voltage**: 3.3V logic, 5V power via USB
- **GPIO Pins**: 11 available
- **Analog Input**: 1 (A0, 0-3.3V)
- **Flash Memory**: 4MB
- **Price**: ~$5-8

#### Wemos D1 Mini (Recommended for Compact Projects)
- **Microcontroller**: ESP8266 (ESP-12S)
- **USB**: Built-in CH340 USB-to-UART
- **Size**: 34.2mm × 25.6mm (very compact)
- **GPIO Pins**: 11 available
- **Flash Memory**: 4MB
- **Price**: ~$3-5

### Pin Mapping Reference

| NodeMCU Pin | GPIO | Function | Notes |
|-------------|------|----------|-------|
| D0 | GPIO16 | Digital I/O | No PWM, No interrupts |
| D1 | GPIO5 | Digital I/O, SCL | I2C Clock |
| D2 | GPIO4 | Digital I/O, SDA | I2C Data |
| D3 | GPIO0 | Digital I/O | Boot mode selector |
| D4 | GPIO2 | Digital I/O | Built-in LED, Boot mode |
| D5 | GPIO14 | Digital I/O, SCK | SPI Clock |
| D6 | GPIO12 | Digital I/O, MISO | SPI Data In |
| D7 | GPIO13 | Digital I/O, MOSI | SPI Data Out |
| D8 | GPIO15 | Digital I/O | Boot mode, active low |
| RX | GPIO3 | UART RX | Serial communication |
| TX | GPIO1 | UART TX | Serial communication |
| A0 | ADC0 | Analog Input | 0-3.3V (0-1024 ADC) |

**Important Notes:**
- D0 (GPIO16) cannot be used for interrupts (PIR sensors won't work here)
- D3, D4, D8 have special boot mode functions - avoid using for critical sensors
- Only **ONE** sensor can use the A0 pin (analog sensors)
- All digital pins operate at **3.3V logic level**

---

## 📡 Supported Sensors

### Temperature & Humidity Sensors

#### DHT22 (AM2302) ⭐ Recommended
```
Specifications:
├── Temperature Range: -40°C to 80°C (±0.5°C accuracy)
├── Humidity Range: 0-100% RH (±2-5% accuracy)
├── Power: 3.3-5V DC
├── Current: 1-1.5mA (measuring), 40-50μA (standby)
├── Sampling Rate: 0.5 Hz (once every 2 seconds)
└── Price: ~$5-7
```

**Wiring:**
```
DHT22        ESP8266
  VCC    →    3.3V or 5V
  DATA   →    D4 (GPIO2)
  GND    →    GND

Note: Add 10kΩ pull-up resistor between DATA and VCC
```

#### DHT11 (Budget Alternative)
- Temperature: 0-50°C (±2°C accuracy)
- Humidity: 20-90% RH (±5% accuracy)
- Lower accuracy but cheaper (~$2-3)
- Same wiring as DHT22

---

### Motion Detection

#### PIR Sensor (HC-SR501) ⭐ Recommended
```
Specifications:
├── Detection Range: 3-7 meters (adjustable)
├── Detection Angle: 120 degrees
├── Power: 4.5-20V DC
├── Current: < 50μA
├── Output: 3.3V digital (HIGH when motion detected)
├── Delay Time: 0.3-300 seconds (adjustable)
└── Price: ~$2-4
```

**Wiring:**
```
HC-SR501     ESP8266
  VCC    →    5V (or 3.3V)
  OUT    →    D2 (GPIO4)
  GND    →    GND
```

**Adjustment Potentiometers:**
- **Sensitivity (Sx)**: Adjust detection distance (clockwise = more sensitive)
- **Time Delay (Tx)**: Adjust how long output stays HIGH after detection

**Jumper Settings:**
- **H (Repeatable Trigger)**: Continues to output HIGH while motion detected
- **L (Single Trigger)**: Outputs HIGH once, then waits for delay

---

### Distance Measurement

#### HC-SR04 Ultrasonic Sensor ⭐ Recommended
```
Specifications:
├── Range: 2cm - 4m
├── Accuracy: ±3mm
├── Measuring Angle: 15 degrees
├── Power: 5V DC
├── Current: 15mA
├── Frequency: 40 kHz
└── Price: ~$2-4
```

**Wiring:**
```
HC-SR04      ESP8266
  VCC    →    5V
  TRIG   →    D5 (GPIO14)
  ECHO   →    D6 (GPIO12)
  GND    →    GND

⚠️ Important: Add voltage divider for ECHO pin!
Use 1kΩ + 2kΩ resistors to step down 5V to 3.3V
```

**Voltage Divider for ECHO Pin:**
```
ECHO (5V) ---[1kΩ]--- D6 (GPIO12) ---[2kΩ]--- GND
                         ↑
                    Safe 3.3V level
```

**Use Cases:**
- Water level monitoring (tank/reservoir)
- Door/gate position detection
- Parking assistance
- Object detection

---

### Light Sensors

#### LDR (Light Dependent Resistor) ⭐ Recommended
```
Specifications:
├── Resistance Range: 200Ω (bright) to 10MΩ (dark)
├── Power: 3.3V
├── Response Time: ~20-30ms
├── Wavelength: 540nm peak
└── Price: ~$0.50-1
```

**Wiring (Voltage Divider):**
```
3.3V
  |
[LDR]
  |----→ A0 (ESP8266 analog input)
  |
[10kΩ]
  |
GND
```

**Reading Values:**
- Bright light: ~900-1024 (ADC)
- Room light: ~400-600
- Dark: ~0-100

---

#### BH1750 Digital Light Sensor (Advanced)
- I2C interface (uses D1/D2 pins)
- More accurate (0-65535 lux)
- Auto-ranging
- Price: ~$2-3

**Wiring:**
```
BH1750       ESP8266
  VCC    →    3.3V
  SDA    →    D2 (GPIO4)
  SCL    →    D1 (GPIO5)
  GND    →    GND
```

---

### Gas & Air Quality Sensors

#### MQ-2 Gas Sensor (Smoke, LPG, Propane)
```
Specifications:
├── Detection: LPG, Propane, Methane, Smoke, Alcohol, Hydrogen
├── Power: 5V DC
├── Preheat Time: 20-24 hours (initial), 2-3 minutes (subsequent)
├── Detection Range: 300-10,000 ppm
├── Output: Analog (A0) and Digital (D0)
└── Price: ~$3-5
```

**Wiring:**
```
MQ-2         ESP8266
  VCC    →    5V
  GND    →    GND
  AO     →    A0 (analog out)
  DO     →    Not used (optional: digital threshold)
```

⚠️ **Important**:
- Sensor needs 24-48 hours burn-in period for accurate readings
- Gets hot during operation (normal)
- Place in well-ventilated area

#### MQ-135 Air Quality Sensor
- Detects: NH3, NOx, Alcohol, Benzene, Smoke, CO2
- Similar wiring to MQ-2
- Better for general air quality monitoring
- Price: ~$3-5

---

### Sound Sensors

#### Analog Sound Sensor (Microphone Module)
```
Specifications:
├── Detection: Sound level/intensity
├── Power: 3.3-5V DC
├── Sensitivity: Adjustable via potentiometer
├── Output: Analog (A0) and Digital (D0)
├── Frequency Response: 16Hz-20kHz
└── Price: ~$1-3
```

**Wiring:**
```
Sound        ESP8266
  VCC    →    3.3V or 5V
  GND    →    GND
  AO     →    A0
```

**Calibration:**
- Adjust sensitivity potentiometer for your noise level
- Values: 0 (quiet) to 1024 (loud)

---

### Magnetic Sensors (Door/Window)

#### Reed Switch Module
```
Specifications:
├── Type: Magnetic proximity switch
├── Detection Distance: 10-20mm
├── Power: 3.3-5V DC
├── Output: Digital (HIGH when magnet near)
└── Price: ~$1-2 per pair
```

**Wiring:**
```
Reed         ESP8266
  VCC    →    3.3V
  GND    →    GND
  OUT    →    D3 (GPIO0)
```

**Installation:**
- Mount switch on door frame
- Mount magnet on door
- Gap < 20mm for reliable operation

---

### Vibration Sensors

#### SW-420 Vibration Sensor
```
Specifications:
├── Detection: Vibration/shock/impact
├── Power: 3.3-5V DC
├── Sensitivity: Adjustable via potentiometer
├── Output: Digital (normally HIGH, LOW on vibration)
└── Price: ~$1-2
```

**Wiring:**
```
SW-420       ESP8266
  VCC    →    3.3V
  GND    →    GND
  DO     →    D7 (GPIO13)
```

**Use Cases:**
- Earthquake detection
- Door knock detection
- Equipment monitoring
- Tamper detection

---

## 🔌 Wiring Diagrams

### Kitchen Monitor (Full Setup)
```
Components:
- NodeMCU ESP8266
- DHT22 (Temperature/Humidity)
- PIR HC-SR501 (Motion)
- LDR (Light)
- MQ-2 (Gas)

Connections:

DHT22:
  VCC → 3.3V
  DATA → D4 (with 10kΩ pull-up to 3.3V)
  GND → GND

PIR HC-SR501:
  VCC → 5V
  OUT → D2
  GND → GND

LDR Circuit:
  3.3V → [LDR] → A0 → [10kΩ] → GND

MQ-2 (optional):
  VCC → 5V
  AO → A0 (if not using LDR)
  GND → GND

Power:
  5V USB → NodeMCU VIN
```

### Security Node
```
Components:
- NodeMCU ESP8266
- PIR HC-SR501 (Motion)
- HC-SR04 (Distance)
- Reed Switch (Door)
- SW-420 (Vibration)

Connections:

PIR:
  VCC → 5V, OUT → D2, GND → GND

HC-SR04:
  VCC → 5V
  TRIG → D5
  ECHO → D6 (through voltage divider!)
  GND → GND

Reed Switch:
  VCC → 3.3V, OUT → D3, GND → GND

SW-420:
  VCC → 3.3V, DO → D7, GND → GND
```

### Environmental Monitor
```
Components:
- Wemos D1 Mini
- DHT22
- BH1750 (I2C light sensor)

Connections:

DHT22:
  VCC → 3.3V
  DATA → D4 (10kΩ pull-up)
  GND → GND

BH1750:
  VCC → 3.3V
  SDA → D2
  SCL → D1
  GND → GND
```

---

## ⚡ Power Requirements

### Power Supply Options

#### 1. USB Power (5V, 500mA-1A) ⭐ Recommended
```
Pros:
✓ Easy and reliable
✓ Regulated 5V
✓ Good for development and permanent installations
✓ Can power ESP8266 + multiple sensors

Cons:
✗ Requires power outlet
✗ Cable can be bulky
```

#### 2. Wall Adapter (5V, 1A-2A)
```
Best for permanent installations:
- Use quality adapter (avoid cheap ones)
- Micro-USB connector for NodeMCU
- Regulated 5V output
- At least 1A current rating
```

#### 3. Battery Power
```
LiPo Battery (3.7V):
- Use TP4056 charging module + protection circuit
- Add voltage regulator (boost to 5V or buck to 3.3V)
- Add on/off switch
- Capacity: 1000-2000mAh typical

Battery Life Estimate:
- Deep sleep enabled: 1-3 months
- Normal operation: 1-3 days
- High sampling rate: 12-24 hours
```

#### 4. Solar Power (Advanced)
```
Components:
- 6V 1W solar panel
- TP4056 charge controller
- 3.7V 2000mAh LiPo battery
- Boost converter (3.7V → 5V)

Best for outdoor installations
```

### Current Consumption

| Component | Active | Sleep | Peak |
|-----------|--------|-------|------|
| ESP8266 | 70-80mA | 15μA | 300mA |
| DHT22 | 1.5mA | 40μA | 2.5mA |
| PIR | 50μA | 50μA | 50μA |
| HC-SR04 | 2mA | 2mA | 15mA |
| MQ-2/135 | 150mA | 150mA | 150mA |
| LDR | < 1mA | < 1mA | < 1mA |

**Total Estimate (Kitchen Monitor):**
- Normal: ~100-150mA (without gas sensor)
- With gas sensor: ~250-300mA
- Power: 0.5-1.5W

---

## 🔨 Assembly Instructions

### Tools Required
- Soldering iron (if not using breadboard)
- Wire strippers
- Small Phillips screwdriver
- Multimeter (for testing)
- Heat shrink tubing or electrical tape

### Step-by-Step Assembly

#### Method 1: Breadboard (Prototyping) ⭐ Beginner-Friendly

**Materials:**
- Breadboard (830 tie-points recommended)
- Jumper wires (male-to-male)
- Components from chosen template

**Steps:**
1. **Place ESP8266** on breadboard (straddle center gap)
2. **Connect power rails**:
   - Red rail → 3.3V pin
   - Blue rail → GND pin
   - Connect 5V pin to separate power rail (for 5V sensors)
3. **Add sensors** one at a time, testing each
4. **Use jumper wires** for clean connections
5. **Test with firmware** before finalizing

**Pros:** Easy, no soldering, reusable
**Cons:** Not permanent, can have loose connections

#### Method 2: PCB Prototype Board (Permanent)

**Materials:**
- Prototyping PCB board
- 22 AWG solid core wire
- Solder and flux
- Terminal blocks (optional)

**Steps:**
1. **Plan layout** on paper first
2. **Solder ESP8266** headers/socket to board
3. **Create power buses** with wire along edges
4. **Solder sensor headers/connectors**
5. **Add decoupling capacitors** (100nF near each sensor)
6. **Test continuity** before powering on

#### Method 3: Custom PCB (Advanced)

Design custom PCB with:
- EasyEDA or KiCAD (free software)
- Order from JLCPCB, PCBWay, etc. (~$5 for 5 boards)
- Professional appearance
- Screw terminals for easy sensor swaps

---

## 🔧 Best Practices

### Wiring Tips
1. **Use colored wires**:
   - Red: Power (3.3V or 5V)
   - Black: Ground
   - Other colors: Signals
2. **Keep wires short** to reduce interference
3. **Twist sensor cables** if running long distances
4. **Add capacitors** (100nF ceramic) near each sensor for stability
5. **Label everything** with tape or heat shrink labels

### Electrical Protection
1. **Voltage dividers** for 5V sensors on 3.3V logic pins
2. **Pull-up resistors** for sensors that require them (DHT22, I2C)
3. **Flyback diodes** if using relays or motors
4. **Fuses** for battery-powered projects

### Enclosure Selection
- **IP Rating**: IP54+ for outdoor use
- **Ventilation**: Required for gas sensors (MQ-2, MQ-135)
- **Material**: Plastic (ABS) for electronics
- **Size**: Allow 20-30% extra space
- **Mounting**: Wall-mount brackets or DIN rail clips

**Recommended Enclosures:**
- Hammond 1591XXSSBK (small, ~$5-8)
- Waterproof junction box (outdoor, ~$10-15)
- 3D printed custom enclosure (perfect fit)

---

## ⚠️ Troubleshooting

### Common Issues

#### Device Won't Connect to WiFi
```
Check:
□ WiFi credentials correct (case-sensitive)
□ 2.4GHz WiFi (ESP8266 doesn't support 5GHz)
□ WiFi signal strength (move closer to router)
□ Router not blocking new devices (MAC filter)
□ Serial monitor for error messages
```

#### Sensor Reading 0 or Constant Value
```
Check:
□ Wiring connections (loose jumper wire?)
□ Correct pin assignment in firmware
□ Sensor has power (measure with multimeter)
□ Sensor not damaged
□ Pull-up resistor if required (DHT22, I2C)
```

#### Random Resets/Crashes
```
Check:
□ Power supply sufficient (use 1A+ adapter)
□ Brownout detection (add capacitor 470μF on VCC)
□ Ground loops (all grounds connected together)
□ Firmware watchdog timeout (add delay in loop)
```

#### DHT22 Shows -999 or NaN
```
Fix:
□ Add 10kΩ pull-up resistor (DATA to VCC)
□ Wait 2 seconds between readings
□ Use 3-wire DHT22 (not 4-wire AM2302)
□ Check wiring (swap cables to test)
```

#### PIR False Triggers
```
Fix:
□ Adjust sensitivity potentiometer (turn CCW)
□ Keep away from heat sources (AC vents, sunlight)
□ Mount securely (vibrations cause triggers)
□ Add delay in code (debounce)
```

#### HC-SR04 Shows Max Distance Always
```
Fix:
□ Add voltage divider on ECHO pin (5V → 3.3V)
□ Check 5V power supply
□ Keep sensor away from soft/sound-absorbing materials
□ Angle sensor perpendicular to target
```

### Testing Sensors Individually

**Voltage Test:**
```bash
Multimeter on VCC pin:
- Should read 3.3V or 5V (depending on sensor)
- If low, check power supply or connection

Ground Test:
- Continuity between sensor GND and ESP8266 GND
```

**Serial Monitor Debug:**
```cpp
void loop() {
  Serial.print("Sensor value: ");
  Serial.println(analogRead(A0));
  delay(1000);
}
```

---

## 🛡️ Safety Guidelines

### Electrical Safety
- ⚠️ **Never exceed 3.3V on ESP8266 GPIO pins** (except VIN which is 5V)
- Always use proper voltage dividers for 5V sensors
- Don't mix up VCC and GND (will damage components)
- Unplug power before making wiring changes

### Gas Sensor Safety
- 🔥 **MQ sensors get HOT** (60-80°C) during operation
- Mount in ventilated enclosure only
- Don't enclose in sealed box (fire hazard)
- Keep away from flammable materials
- Not for safety-critical applications (use certified sensors)

### Battery Safety
- 🔋 Use protection circuits with LiPo batteries
- Don't over-discharge (< 3.0V per cell)
- Don't overcharge (> 4.2V per cell)
- Store in fireproof bag
- Don't puncture or short-circuit

### Installation Safety
- ⚡ Don't install near AC mains without proper insulation
- Use proper wire gauge (22-24 AWG for sensors)
- Secure all connections (prevent shorts)
- Test before installing in hard-to-reach places

---

## 📚 Additional Resources

### Datasheets
- [ESP8266 Datasheet](https://www.espressif.com/sites/default/files/documentation/0a-esp8266ex_datasheet_en.pdf)
- [DHT22 Datasheet](https://www.sparkfun.com/datasheets/Sensors/Temperature/DHT22.pdf)
- [HC-SR04 Datasheet](https://cdn.sparkfun.com/datasheets/Sensors/Proximity/HCSR04.pdf)

### Suppliers
- **AliExpress**: Cheapest (2-4 weeks shipping)
- **Amazon**: Fast shipping (1-2 days)
- **Adafruit/SparkFun**: Quality components, tutorials

### Learning Resources
- [Random Nerd Tutorials](https://randomnerdtutorials.com/projects-esp8266/)
- [ESP8266 Arduino Core Docs](https://arduino-esp8266.readthedocs.io/)
- [Circuit Digest ESP8266 Projects](https://circuitdigest.com/microcontroller-projects/esp8266-projects)

---

## 🎓 Beginner Tips

### First Project Recommendations
1. **Start Simple**: Temperature sensor only (DHT22 + ESP8266)
2. **Use Breadboard**: Easy to modify and learn
3. **Test Incrementally**: Add one sensor at a time
4. **Read Serial Output**: Essential for debugging
5. **Join Community**: Reddit r/esp8266, Arduino forums

### Common Mistakes to Avoid
- ❌ Using 5V sensors directly on 3.3V GPIO (will damage ESP8266)
- ❌ Not using pull-up resistors where needed
- ❌ Cheap power supplies (cause instability)
- ❌ Long sensor wires without shielding (interference)
- ❌ Skipping voltage dividers on 5V sensors

---

**Last Updated**: October 2025
**Compatible Firmware Version**: 2.2.0+

For questions or contributions, please open an issue on GitHub.
