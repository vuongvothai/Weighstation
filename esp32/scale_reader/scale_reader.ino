/*
 * ESP32 Super Mini (ESP32-C3) Scale Reader — đọc cân Yaohua YH-T7E qua UART,
 * expose GET /weight. Thay thế vai trò scale_agent.py khi cân cắm vào ESP32.
 * Agent Python tự forward sang ESP32 khi COM không kết nối.
 *
 * ⚠️ QUAN TRỌNG — mức điện áp:
 *   Cân YH-T7E xuất RS232 (±12V). ESP32-C3 chỉ chịu 3.3V → PHẢI có bộ chuyển
 *   mức MAX3232 (hoặc MAX232) ở giữa, nếu không sẽ cháy chân ESP32.
 *
 * Wiring (qua MAX3232):
 *   Cân TX (RS232) → MAX3232 T1IN
 *   MAX3232 R1OUT  → ESP32 GPIO20 (RX1)
 *   ESP32 GPIO21   → MAX3232 T1IN phía ESP (nếu cân cần nhận lệnh)
 *   GND chung      → GND chung cả 3 thiết bị
 *   MAX3232 VCC    → 3.3V (dùng loại MAX3232 chạy 3.3V)
 *
 * Cấu hình:
 *   - UART baud: 1200 (mặc định YH-T7E). Sửa UART_BAUD nếu cân chạy baud khác.
 *   - WiFi: sửa WIFI_SSID / WIFI_PASSWORD.
 *   - ESP32-C3 chỉ có 1 UART phần cứng (Serial1) ngoài Serial USB.
 */
#include <WiFi.h>
#include <WebServer.h>
#include <ArduinoJson.h>

// ── Cấu hình WiFi (AP mode — ESP32 tự phát mạng) ──────────────────────────────
// ESP32 phát mạng riêng, điện thoại/máy kết nối vào để truy cập /weight.
// IP mặc định của ESP32 trong AP mode: 192.168.4.1
const char* AP_SSID     = "Tram_Can";
const char* AP_PASSWORD = "12345678";

// // IP tĩnh (đặt .201 cố định).
// IPAddress LOCAL_IP(192, 168, 1, 201);
// IPAddress GATEWAY(192, 168, 1, 1);
// IPAddress SUBNET(255, 255, 255, 0);

// ── Cấu hình UART (ESP32-C3 Super Mini) ───────────────────────────────────────
// Chân theo board thực tế: TX=GPIO21, RX=GPIO20.
#define RXD1 20
#define TXD1 21
#define UART_BAUD 1200

HardwareSerial ScaleSerial(1);  // UART1 (UART0 đã dùng cho USB Serial)
WebServer server(80);

// ── State (giống WeightState của agent) ───────────────────────────────────────
float   g_value   = 0;
bool    g_stable  = false;
String  g_raw     = "";
String  g_ts      = "";
float   g_history[3];
int     g_hist_len = 0;

// ── Parse frame 8 byte (giống parse_frame của agent) ──────────────────────────
float parseFrame(const String& frame) {
  if (frame.length() < 8) return NAN;
  String digits;
  bool neg = false;
  if (frame[0] == '=') {
    digits = frame.substring(1, 8);
  } else if (frame.substring(0, 2) == "-=") {
    digits = frame.substring(2, 8);
    neg = true;
  } else {
    return NAN;
  }
  // Đảo ngược 7 ký tự
  String rev = "";
  for (int i = digits.length() - 1; i >= 0; i--) rev += digits[i];
  float v = rev.toFloat();
  return neg ? -v : v;
}

// ── Cập nhật state từ frame mới ───────────────────────────────────────────────
void updateState(const String& frame) {
  g_raw = frame;
  g_ts = String(millis());
  float v = parseFrame(frame);
  if (isnan(v)) { g_stable = false; return; }
  g_history[g_hist_len % 3] = v;
  g_hist_len++;
  g_value = v;
  g_stable = (g_hist_len >= 3 &&
              g_history[(g_hist_len-1)%3] == g_history[(g_hist_len-2)%3] &&
              g_history[(g_hist_len-2)%3] == g_history[(g_hist_len-3)%3]);
}

// ── Đọc UART, tách frame 8 byte ───────────────────────────────────────────────
String g_buffer = "";
void readScale() {
  while (ScaleSerial.available()) {
    g_buffer += (char)ScaleSerial.read();
  }
  // Tách frame hợp lệ
  while (g_buffer.length() >= 8) {
    char c0 = g_buffer[0];
    bool ok = false;
    String frame;
    if (c0 == '=') {
      ok = true;
      for (int i = 1; i <= 6; i++) {
        char c = g_buffer[i];
        if (!((c >= '0' && c <= '9') || c == '.')) { ok = false; break; }
      }
      if (ok && (g_buffer[7] == '-' || (g_buffer[7] >= '0' && g_buffer[7] <= '9'))) {
        frame = g_buffer.substring(0, 8);
      } else ok = false;
    } else if (c0 == '-' && g_buffer[1] == '=') {
      ok = true;
      for (int i = 2; i <= 7; i++) {
        char c = g_buffer[i];
        if (!((c >= '0' && c <= '9') || c == '.')) { ok = false; break; }
      }
      if (ok) frame = g_buffer.substring(0, 8);
    }
    if (ok) {
      updateState(frame);
      g_buffer = g_buffer.substring(8);
    } else {
      g_buffer = g_buffer.substring(1);
    }
  }
}

// ── HTTP handlers ─────────────────────────────────────────────────────────────
void handleWeight() {
  StaticJsonDocument<256> doc;
  if (isnan(g_value)) doc["value"] = nullptr;
  else doc["value"] = g_value;
  doc["unit"]    = "kg";
  doc["stable"]  = g_stable;
  doc["raw"]     = g_raw;
  doc["ts"]      = g_ts;
  String out;
  serializeJson(doc, out);
  server.sendHeader("Access-Control-Allow-Origin", "*");
  server.send(200, "application/json", out);
}

void handleHealth() {
  StaticJsonDocument<256> doc;
  doc["connected"]    = true;
  doc["port"]         = "ESP32-C3-UART1";
  doc["baudRate"]     = UART_BAUD;
  doc["autoDetect"]   = false;
  doc["lastRaw"]      = g_raw;
  doc["lastReadAt"]   = g_ts;
  String out;
  serializeJson(doc, out);
  server.sendHeader("Access-Control-Allow-Origin", "*");
  server.send(200, "application/json", out);
}

void setup() {
  Serial.begin(115200);
  ScaleSerial.begin(UART_BAUD, SERIAL_8N1, RXD1, TXD1);

  // ── AP mode: ESP32 tự phát WiFi ──
  Serial.println("\nStarting AP mode...");
  WiFi.mode(WIFI_AP);
  bool apOk = WiFi.softAP(AP_SSID, AP_PASSWORD);
  if (apOk) {
    Serial.println("AP started OK");
    Serial.print("  SSID: ");      Serial.println(AP_SSID);
    Serial.print("  IP: ");        Serial.println(WiFi.softAPIP());  // 192.168.4.1
    // Giảm công suất phát xuống 8.5dBm để thử tránh nhiễu RF.
    WiFi.setTxPower(WIFI_POWER_8_5dBm);
    Serial.println("  TX power set to 8.5 dBm");
  } else {
    Serial.println("AP FAILED to start!");
  }

  server.on("/weight", HTTP_GET, handleWeight);
  server.on("/health", HTTP_GET, handleHealth);
  server.begin();
}

void loop() {
  server.handleClient();
  readScale();
  delay(5);
}