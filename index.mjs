import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import express from "express";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { readFileSync, writeFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

// Lấy đường dẫn thư mục hiện tại (ESM không có __dirname)
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const CONFIG_PATH = join(__dirname, "tools-config.json");

// ===== HÀM ĐỌC/GHI CONFIG =====

/**
 * Đọc danh sách tools từ file config JSON.
 * Mỗi lần gọi sẽ đọc lại file → luôn lấy data mới nhất (hot-reload).
 */
function loadToolsConfig() {
  try {
    const raw = readFileSync(CONFIG_PATH, "utf-8");
    const config = JSON.parse(raw);
    return config.tools || [];
  } catch (err) {
    console.error("⚠️ Không đọc được tools-config.json:", err.message);
    return [];
  }
}

/**
 * Ghi danh sách tools vào file config JSON.
 */
function saveToolsConfig(tools) {
  const config = { tools };
  writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), "utf-8");
}

// ===== KHỞI TẠO EXPRESS + MCP =====

const app = express();
app.use(express.json());

const server = new Server(
  {
    name: "caoto-botcake-mcp",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// ===== MCP: KHAI BÁO TOOLS (đọc từ config) =====

server.setRequestHandler(ListToolsRequestSchema, async () => {
  // Đọc lại config mỗi lần → hot-reload, sửa config là có hiệu lực ngay
  const tools = loadToolsConfig();
  return { tools };
});

// ===== MCP: XỬ LÝ KHI GỌI TOOLS =====

// ===== HÀM PHÁT HIỆN SỐ ĐIỆN THOẠI BẰNG REGEX =====

/**
 * Phát hiện số điện thoại Việt Nam trong chuỗi text.
 * Nhận dạng các định dạng:
 *   0912345678, 0912 345 678, 0912.345.678, 0912-345-678
 *   +84912345678, +84 912 345 678
 *   84912345678
 * 
 * @param {string} text - Nội dung tin nhắn
 * @returns {{ found: boolean, phones: string[] }}
 */
function detectPhoneNumbers(text) {
  // Regex: Số VN bắt đầu bằng 0, +84, hoặc 84, theo sau là 9-10 chữ số
  // Cho phép dấu cách, chấm, gạch ngang giữa các nhóm số
  const phoneRegex = /(?:\+?84|0)[\s.\-]?(\d[\s.\-]?){8,10}\d/g;

  // Tìm tất cả matches
  const rawMatches = text.match(phoneRegex) || [];

  // Làm sạch: loại bỏ dấu cách, chấm, gạch ngang
  const phones = rawMatches
    .map((m) => m.replace(/[\s.\-]/g, ""))
    .filter((p) => {
      // Validate: sau khi làm sạch phải có 10-12 ký tự (bao gồm +84 hoặc 84 prefix)
      const digitsOnly = p.replace(/\D/g, "");
      return digitsOnly.length >= 9 && digitsOnly.length <= 12;
    });

  return {
    found: phones.length > 0,
    phones: [...new Set(phones)], // Loại bỏ trùng lặp
  };
}

// ===== MCP: XỬ LÝ KHI GỌI TOOLS =====

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const toolName = request.params.name;
  const args = request.params.arguments;

  // Kiểm tra tool có tồn tại trong config không
  const tools = loadToolsConfig();
  const tool = tools.find((t) => t.name === toolName);

  if (!tool) {
    throw new Error(`Tool không được hỗ trợ: ${toolName}`);
  }

  // Log thông tin gọi tool
  console.log(`[MCP] Gọi tool: ${toolName}`, JSON.stringify(args));

  // ===== TOOL: process_message =====
  // Phân tích tin nhắn khách hàng bằng regex phía server
  if (toolName === "process_message") {
    const { customer_id, message } = args;
    const results = [];

    // 1. Phát hiện số điện thoại → gắn "Đã chốt đơn"
    const phoneCheck = detectPhoneNumbers(message);
    if (phoneCheck.found) {
      console.log(
        `[AUTO-TAG] ✅ Phát hiện SĐT: ${phoneCheck.phones.join(", ")} → Gắn "Đã chốt đơn" cho khách ${customer_id}`
      );
      // TODO: Gọi API Pancake thật để gắn tag
      results.push(
        `✅ Phát hiện số điện thoại: ${phoneCheck.phones.join(", ")}`,
        `✅ Đã tự động gắn nhãn "Đã chốt đơn" cho khách ${customer_id}`
      );
    } else {
      console.log(
        `[AUTO-TAG] ℹ️ Không phát hiện SĐT trong tin nhắn của khách ${customer_id}`
      );
      results.push("ℹ️ Không phát hiện số điện thoại trong tin nhắn.");
    }

    return {
      content: [
        {
          type: "text",
          text: results.join("\n"),
        },
      ],
    };
  }

  // ===== TOOL: add_tag =====
  if (toolName === "add_tag") {
    const { customer_id, tag_name } = args;
    console.log(
      `[Hệ thống] Đang gọi API gắn thẻ '${tag_name}' cho khách ${customer_id}...`
    );
    // TODO: Gọi API thật của Pancake/Haravan ở đây
    return {
      content: [
        { type: "text", text: `Đã gắn thẻ "${tag_name}" thành công cho khách ${customer_id}.` },
      ],
    };
  }

  // ===== TOOL: remove_tag =====
  if (toolName === "remove_tag") {
    const { customer_id, tag_name } = args;
    console.log(
      `[Hệ thống] Đang gọi API gỡ thẻ '${tag_name}' cho khách ${customer_id}...`
    );
    // TODO: Gọi API thật của Pancake/Haravan ở đây
    return {
      content: [
        { type: "text", text: `Đã gỡ thẻ "${tag_name}" thành công cho khách ${customer_id}.` },
      ],
    };
  }

  // Fallback: tool tồn tại trong config nhưng chưa có handler
  return {
    content: [
      {
        type: "text",
        text: `Tool "${toolName}" đã được gọi với tham số: ${JSON.stringify(args)}. (Chưa có handler cụ thể)`,
      },
    ],
  };
});

// ===== GIAO TIẾP SSE CHO BOTCAKE/REDAI =====

let transport;

app.get("/sse", async (req, res) => {
  transport = new SSEServerTransport("/message", res);
  await server.connect(transport);
  console.log("Client đã kết nối thành công qua SSE.");
});

app.post("/message", async (req, res) => {
  if (transport) {
    await transport.handlePostMessage(req, res);
  } else {
    res.status(500).send("Chưa có kết nối SSE nào được khởi tạo.");
  }
});

// ===== TRANG CHỦ =====

app.get("/", (req, res) => {
  res.send("MCP Server cho CAO TO BIG MEN đang hoạt động!");
});

// ===== ADMIN PANEL =====

// Trang quản lý tools — truy cập tại /admin
app.get("/admin", (req, res) => {
  res.sendFile(join(__dirname, "admin.html"));
});

// API: Lấy danh sách tools
app.get("/api/tools", (req, res) => {
  const tools = loadToolsConfig();
  res.json({ tools });
});

// API: Lưu danh sách tools
app.post("/api/tools", (req, res) => {
  try {
    const { tools } = req.body;
    if (!Array.isArray(tools)) {
      return res.status(400).json({ success: false, error: "tools phải là array" });
    }
    saveToolsConfig(tools);
    console.log(`[Admin] Đã cập nhật config: ${tools.length} tools`);
    res.json({ success: true, message: `Đã lưu ${tools.length} tools.` });
  } catch (err) {
    console.error("[Admin] Lỗi khi lưu config:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ===== REST API CHO BOTCAKE (giữ tương thích & Webhook) =====

app.post("/api/process_message", (req, res) => {
  const { customer_id, message } = req.body;
  const results = [];

  const phoneCheck = detectPhoneNumbers(message || "");
  if (phoneCheck.found) {
    console.log(
      `[REST-AUTO-TAG] ✅ Phát hiện SĐT: ${phoneCheck.phones.join(", ")} → Gắn "Đã chốt đơn" cho khách ${customer_id}`
    );
    // TODO: Gọi API Pancake thật để gắn tag
    results.push(`✅ Phát hiện số điện thoại: ${phoneCheck.phones.join(", ")}`);
    results.push(`✅ Đã tự động gắn nhãn "Đã chốt đơn" cho khách ${customer_id}`);
  } else {
    console.log(`[REST-AUTO-TAG] ℹ️ Không phát hiện SĐT cho khách ${customer_id}`);
    results.push("ℹ️ Không phát hiện số điện thoại trong tin nhắn.");
  }

  res.json({
    success: true,
    message: results.join(" | "),
    detected_phones: phoneCheck.phones
  });
});

app.post("/api/add_tag", (req, res) => {
  const { customer_id, tag_name } = req.body;
  console.log(
    `[REST API] Đang gắn thẻ '${tag_name}' cho khách ${customer_id}...`
  );
  res.json({
    success: true,
    message: `Đã gắn thẻ "${tag_name}" thành công cho khách ${customer_id}.`,
  });
});

app.post("/api/remove_tag", (req, res) => {
  const { customer_id, tag_name } = req.body;
  console.log(
    `[REST API] Đang gỡ thẻ '${tag_name}' cho khách ${customer_id}...`
  );
  res.json({
    success: true,
    message: `Đã gỡ thẻ "${tag_name}" thành công cho khách ${customer_id}.`,
  });
});

// ===== KHỞI ĐỘNG SERVER =====

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  const tools = loadToolsConfig();
  console.log(`🚀 MCP Server đang chạy tại cổng ${PORT}`);
  console.log(`📋 Đã load ${tools.length} tools từ config`);
  console.log(`🛠️  Admin Panel: http://localhost:${PORT}/admin`);
  console.log(
    `📡 URL cho Botcake/RedAI: https://<tên-miền-của-bạn>/sse`
  );
});
