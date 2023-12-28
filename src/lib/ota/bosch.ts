import {Zh, Logger, Ota} from '../types';
import * as common from './common';
import * as zigbeeOTA from './zigbeeOTA';
import * as timers from 'timers';
import {adaptationStatus, manufacturerOptions} from '../../devices/bosch';

async function valveAdaptationAfterUpdate(device: Zh.Device, logger: Logger) {
    const getThermostatEndpoint = () => {
        return device.endpoints.find((e) => e.supportsOutputCluster('hvacThermostat'));
    };

    const startAdaptationStatusCheck = () => {
        logger.debug('Add valve adaptation status check to timer.');
        return timers.setInterval(checkAdaptationStatus, 10 * 1000);
    };

    const sendCalibrationCommand = () => {
        const valveCalibrationCommand =
            thermostatEndpoint.command('hvacThermostat', 'boschCalibrateValve', {}, manufacturerOptions);

        valveCalibrationCommand.then(() => {
            logger.debug('Successfully send valve calibration command.');
        }, (error) => {
            logger.debug(`Error during valve calibration command! Error message: ${error.message}`);
            checkForTimeout();
        });
    };

    const checkForTimeout = () => {
        if (Date.now() >= abortTime) {
            stopCheckAdaptationStatus();
            throw new Error(`Timeout during valve calibration process of device ${device.ieeeAddr}! Please check device!`);
        }
    };

    const stopCheckAdaptationStatus = () => {
        logger.debug('Remove valve adaptation status check from timer.');
        clearInterval(checkAdaptationTimer);
    };

    const checkAdaptationStatus = () => {
        const readAdaptationStatus = thermostatEndpoint.read('hvacThermostat', [0x4022], manufacturerOptions);

        readAdaptationStatus.then((response) => {
            logger.debug(`Adaptation status is ${response[0x4022]}`);

            switch (response[0x4022]) {
            case adaptationStatus.ready_to_calibrate:
                sendCalibrationCommand();
                break;
            case adaptationStatus.error:
                stopCheckAdaptationStatus();
                throw new Error(`Error during valve adaptation process of device ${device.ieeeAddr}! Please check device!`);
            case adaptationStatus.success:
                stopCheckAdaptationStatus();
                break;
            default:
                checkForTimeout();
                break;
            }
        }, (error) => {
            logger.debug(`Valve adaptation status could not be read. Error message: ${error.message}`);
            checkForTimeout();
        });
    };

    const abortTime = Date.now() + 5 * 60 * 1000;
    logger.debug(`Set timeout for valve adaptation of device ${device.ieeeAddr} to ${abortTime}.`);

    const thermostatEndpoint = getThermostatEndpoint();
    const checkAdaptationTimer = startAdaptationStatusCheck();
}
export async function isUpdateAvailable(device: Zh.Device, logger: Logger, requestPayload:Ota.ImageInfo=null) {
    return common.isUpdateAvailable(device, logger, common.isNewImageAvailable, requestPayload, zigbeeOTA.getImageMeta);
}
export async function updateToLatest(device: Zh.Device, logger: Logger, onProgress: Ota.OnProgress) {
    const updateProcess = common.updateToLatest(device, logger, onProgress, common.getNewImage, zigbeeOTA.getImageMeta);

    if (device.modelID == 'BTH-RA') {
        updateProcess.then(() => {
            valveAdaptationAfterUpdate(device, logger);
        });
    }

    return updateProcess;
}

exports.isUpdateAvailable = isUpdateAvailable;
exports.updateToLatest = updateToLatest;
