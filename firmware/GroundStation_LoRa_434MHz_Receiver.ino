/**
 * ============================================================================
 * ORBITAL-6U CUBESAT GROUND STATION RECEIVER FIRMWARE (440.000 MHz LoRa)
 * ============================================================================
 * Hardware:
 *   - ESP32 / ESP8266 / Arduino Uno / Nano / Mega / Teensy / STM32
 *   - LoRa Transceiver: Semtech SX1278 / SX1276 / RFM95W / AI-Thinker Ra-02
 * 
 * Library Required:
 *   - "LoRa" by Sandeep Mistry (Install via Arduino IDE Library Manager)
 * 
 * Wiring (Standard ESP32 to SX1278 Ra-02):
 *   SX1278 NSS  -> ESP32 GPIO 5
 *   SX1278 RST  -> ESP32 GPIO 14
 *   SX1278 DIO0 -> ESP32 GPIO 2
 *   SX1278 SCK  -> ESP32 GPIO 18
 *   SX1278 MISO -> ESP32 GPIO 19
 *   SX1278 MOSI -> ESP32 GPIO 23
 *   SX1278 3.3V -> ESP32 3.3V  (DO NOT CONNECT TO 5V!)
 *   SX1278 GND  -> ESP32 GND
 * ============================================================================
 */

#include <SPI.h>
#include <LoRa.h>

// Pin definitions (Modify as needed for your specific board)
#if defined(ESP32)
  #define LORA_SS    5
  #define LORA_RST   14
  #define LORA_DIO0  2
#elif defined(ESP8266)
  #define LORA_SS    15
  #define LORA_RST   16
  #define LORA_DIO0  4
#else // Arduino Uno / Nano
  #define LORA_SS    10
  #define LORA_RST   9
  #define LORA_DIO0  2
#endif

// Target RF Frequency: 440.000 MHz (440E6 Hz)
const long FREQUENCY_HZ = 440000000; // 440.000 MHz UHF

unsigned long packetCounter = 0;

void setup() {
  Serial.begin(115200);
  while (!Serial);

  delay(1000);
  Serial.println(F("========================================================="));
  Serial.println(F(" 🛰️  6U CUBESAT GROUND STATION RECEIVER (440 MHz LoRa)   "));
  Serial.println(F("========================================================="));

  // Configure LoRa module SPI pins
  LoRa.setPins(LORA_SS, LORA_RST, LORA_DIO0);

  // Initialize transceiver at 440.000 MHz
  if (!LoRa.begin(FREQUENCY_HZ)) {
    Serial.println(F("[ERROR] LoRa transceiver initialization failed!"));
    Serial.println(F("Check SPI wiring (NSS, SCK, MOSI, MISO, RST, DIO0) and 3.3V power."));
    while (true) {
      delay(1000);
    }
  }

  // Configure LoRa RF parameters
  LoRa.setSpreadingFactor(7);           // SF7 (Ranges 6 to 12)
  LoRa.setSignalBandwidth(125E3);       // 125 kHz
  LoRa.setCodingRate4(5);              // 4/5 Coding Rate
  LoRa.setSyncWord(0x12);              // Private Sync Word (0x12) or 0x34 (Public)
  LoRa.enableCrc();                    // Enable Cyclic Redundancy Check

  Serial.println(F("[STATUS] LoRa 440.000 MHz Receiver ACTIVE & LISTENING..."));
  Serial.println(F("[STATUS] Ready for Ground Station Web Dashboard connection."));
  Serial.println(F("========================================================="));
}

void loop() {
  // Check if packet has arrived over 440 MHz RF link
  int packetSize = LoRa.parsePacket();

  if (packetSize) {
    packetCounter++;
    String incomingPayload = "";

    while (LoRa.available()) {
      incomingPayload += (char)LoRa.read();
    }

    int rssi = LoRa.packetRssi();
    float snr = LoRa.packetSnr();

    // Check if incoming payload is already valid JSON
    incomingPayload.trim();
    if (incomingPayload.startsWith("{") && incomingPayload.endsWith("}")) {
      // If it doesn't already have RSSI and SNR, inject them
      if (incomingPayload.indexOf("\"rssi\"") == -1) {
        incomingPayload.remove(incomingPayload.length() - 1);
        incomingPayload += ",\"rssi\":" + String(rssi) + ",\"snr\":" + String(snr, 1) + "}";
      }
      Serial.println(incomingPayload);
    } else {
      // Wrap formatted telemetry output with RSSI & SNR
      Serial.print(F("{\"raw\":\""));
      Serial.print(incomingPayload);
      Serial.print(F("\",\"rssi\":"));
      Serial.print(rssi);
      Serial.print(F(",\"snr\":"));
      Serial.print(snr, 1);
      Serial.print(F(",\"freq_mhz\":440.000"));
      Serial.print(F(",\"pkt\":"));
      Serial.print(packetCounter);
      Serial.println(F("}"));
    }
  }
}
