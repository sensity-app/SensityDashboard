SELECT 
    ds.id,
    ds.name,
    ds.pin,
    st.name as sensor_type,
    ds.calibration_multiplier,
    ds.calibration_offset,
    d.name as device_name
FROM device_sensors ds
JOIN sensor_types st ON ds.sensor_type_id = st.id
JOIN devices d ON ds.device_id = d.id
WHERE ds.calibration_multiplier != 1 OR ds.calibration_offset != 0
ORDER BY ds.calibration_multiplier DESC;
