const { exec } = require('child_process');
const fs = require('fs').promises;
const path = require('path');
const { promisify } = require('util');
const logger = require('../utils/logger');

const execPromise = promisify(exec);

class FirmwareCompiler {
    constructor() {
        this.tempDir = path.join(__dirname, '../../temp/builds');
        this.arduinoCLI = 'arduino-cli';
        this.esp8266FQBN = 'esp8266:esp8266:nodemcuv2';
    }

    async ensureTempDir() {
        try {
            await fs.mkdir(this.tempDir, { recursive: true });
        } catch (error) {
            logger.error('Failed to create temp directory:', error);
            throw error;
        }
    }

    async compile(deviceId, inoContent, configContent) {
        await this.ensureTempDir();

        const buildDir = path.join(this.tempDir, deviceId);
        const sketchDir = path.join(buildDir, 'sketch');
        const outputDir = path.join(buildDir, 'output');

        try {
            // Create directories
            await fs.mkdir(sketchDir, { recursive: true });
            await fs.mkdir(outputDir, { recursive: true });

            // Write firmware files
            const inoPath = path.join(sketchDir, 'sketch.ino');
            const configPath = path.join(sketchDir, 'device_config.h');

            await fs.writeFile(inoPath, inoContent);
            await fs.writeFile(configPath, configContent);

            logger.info(`Compiling firmware for device ${deviceId}...`);

            // Compile with arduino-cli
            const compileCommand = `${this.arduinoCLI} compile --fqbn ${this.esp8266FQBN} --output-dir ${outputDir} ${sketchDir}`;

            const { stdout, stderr } = await execPromise(compileCommand, {
                timeout: 120000, // 2 minutes timeout
                maxBuffer: 10 * 1024 * 1024 // 10MB buffer
            });

            if (stderr && !stderr.includes('Used library')) {
                logger.warn('Compilation warnings:', stderr);
            }

            logger.info(`Firmware compiled successfully for ${deviceId}`);

            // Read the compiled binary
            const binPath = path.join(outputDir, 'sketch.ino.bin');
            const binData = await fs.readFile(binPath);

            // Read partition table and bootloader (ESP8266 specific)
            const bootloaderPath = this.getBootloaderPath();
            let bootloader = null;

            try {
                bootloader = await fs.readFile(bootloaderPath);
            } catch (error) {
                logger.warn('Bootloader not found, will flash app binary only');
            }

            // Cleanup temp files
            await this.cleanup(buildDir);

            return {
                success: true,
                firmware: binData,
                bootloader: bootloader,
                flashFiles: [
                    {
                        data: binData.toString('base64'),
                        address: 0x0000 // ESP8266 app starts at 0x0
                    }
                ]
            };

        } catch (error) {
            logger.error('Firmware compilation failed:', error);

            // Cleanup on error
            try {
                await this.cleanup(buildDir);
            } catch (cleanupError) {
                logger.warn('Cleanup failed:', cleanupError);
            }

            throw new Error(`Compilation failed: ${error.message}`);
        }
    }

    getBootloaderPath() {
        // ESP8266 bootloader location
        const homeDir = require('os').homedir();
        return path.join(
            homeDir,
            'Library/Arduino15/packages/esp8266/hardware/esp8266/3.1.2/bootloaders/eboot/eboot.elf'
        );
    }

    async cleanup(buildDir) {
        try {
            await fs.rm(buildDir, { recursive: true, force: true });
            logger.info(`Cleaned up build directory: ${buildDir}`);
        } catch (error) {
            logger.error('Cleanup error:', error);
        }
    }
}

module.exports = new FirmwareCompiler();
