/**
 * ============================================================================
 * 6U CUBESAT / CANSAT TELEMETRY TRANSMITTER FIRMWARE (440.000 MHz LoRa)
 * ============================================================================
 * Transmits sensor telemetry (temperature, pressure, battery, IMU attitude,
 * and GPS coordinates) at 440.000 MHz UHF to the Ground Station receiver.
 * ============================================================================
 */

#include <SPI.h>
#include <LoRa.h>

#if defined(ESP32)
  #define LORA_SS    5
  #define LORA_RST   14
  #define LORA_DIO0  2
#else
  #define LORA_SS    10
  #define LORA_RST   9
  #define LORA_DIO0  2
#endif

const long FREQUENCY_HZ = 440000000; // 440.000 MHz UHF
unsigned long packetCount = 0;
float simTime = 0.0;

void setup() {
  Serial.begin(115200);
  LoRa.setPins(LORA_SS, LORA_RST, LORA_DIO0);

  if (!LoRa.begin(FREQUENCY_HZ)) {
    Serial.println(F("[ERROR] LoRa transmitter initialization failed!"));
    while (1);
  }

  LoRa.setSpreadingFactor(7);
  LoRa.setSignalBandwidth(125E3);
  LoRa.setCodingRate4(5);
  LoRa.setSyncWord(0x12);
  LoRa.enableCrc();
  LoRa.setTxPower(20); // 20 dBm (100 mW)

  Serial.println(F("[CUBESAT] 440.000 MHz LoRa Transmitter Ready."));
}

void loop() {
  packetCount++;
  simTime += 0.2;

  // Read your real physical sensors here (e.g. BMP280, MPU6050, INA219, GPS NEO-6M)
  // Or simulated values if testing without sensors:
  float tempExt = 22.4 + 4.0 * sin(simTime * 0.1);
  float pressure = 1013.25 + 2.0 * cos(simTime * 0.08);
  float humidity = 45.0 + 3.0 * sin(simTime * 0.15);
  float tempInt = 24.1 + 1.5 * sin(simTime * 0.05);
  float battery = max(20.0, 92.0 - (packetCount * 0.01));
  float solarKw = max(0.0, 0.58 * sin(simTime * 0.08));
  float pitch = 11.5 * sin(simTime * 0.2);
  float roll = -6.8 * cos(simTime * 0.18);
  float yaw = fmod(simTime * 6.0, 360.0);
  float lat = 28.6139 + 0.01 * sin(simTime * 0.05);
  float lon = 77.2090 + 0.01 * cos(simTime * 0.05);
  float altKm = 512.4 + 1.2 * sin(simTime * 0.1);

  // Construct JSON telemetry packet
  String packet = "{";
  packet += "\"packet_id\":" + String(packetCount) + ",";
  packet += "\"freq\":440.000,";
  packet += "\"temp_ext\":" + String(tempExt, 2) + ",";
  packet += "\"press\":" + String(pressure, 2) + ",";
  packet += "\"hum\":" + String(humidity, 1) + ",";
  packet += "\"temp_int\":" + String(tempInt, 1) + ",";
  packet += "\"battery\":" + String(battery, 1) + ",";
  packet += "\"solar_kw\":" + String(solarKw, 3) + ",";
  packet += "\"pitch\":" + String(pitch, 2) + ",";
  packet += "\"roll\":" + String(roll, 2) + ",";
  packet += "\"yaw\":" + String(yaw, 2) + ",";
  packet += "\"lat\":" + String(lat, 4) + ",";
  packet += "\"lon\":" + String(lon, 4) + ",";
  packet += "\"alt\":" + String(altKm, 1);
  packet += "}";

  // Transmit over 440.000 MHz LoRa
  LoRa.beginPacket();
  LoRa.print(packet);
  LoRa.endPacket();

  Serial.print(F("[TX 440MHz #"));
  Serial.print(packetCount);
  Serial.print(F("] -> "));
  Serial.println(packet);

  delay(500); // 2 Hz transmission rate
}
