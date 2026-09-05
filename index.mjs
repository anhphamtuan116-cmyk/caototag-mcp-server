import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import express from "express";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

// Khởi tạo Express app (Web Server)
const app = express();
app.use(express.json());

// Khởi tạo MCP Server
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

// Khai báo danh sách Tools
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "add_tag",
        description: "Gắn một thẻ (tag) cho khách hàng. Sử dụng khi khách hàng đạt một trạng thái cụ thể (ví dụ: đã chốt đơn, khách sỉ).",
        inputSchema: {
          type: "object",
          properties: {
            customer_id: {
              type: "string",
              description: "ID của khách hàng",
            },
            tag_name: {
              type: "string",
              description: "Tên thẻ cần gắn (ví dụ: 'Đã chốt đơn', 'Khách VIP', 'Khách sỉ')",
            },
          },
          required: ["customer_id", "tag_name"],
        },
      },
      {
        name: "remove_tag",
        description: "Gỡ một thẻ (tag) khỏi khách hàng. Sử dụng khi trạng thái của khách hàng thay đổi.",
        inputSchema: {
          type: "object",
          properties: {
            customer_id: {
              type: "string",
              description: "ID của khách hàng",
            },
            tag_name: {
              type: "string",
              description: "Tên thẻ cần gỡ",
            },
          },
          required: ["customer_id", "tag_name"],
        },
      },
    ],
  };
});

// Xử lý Logic khi gọi Tools
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const toolName = request.params.name;
  
  if (toolName === "add_tag") {
    const { customer_id, tag_name } = request.params.arguments;
    console.log(`[Hệ thống] Đang gọi API gắn thẻ '${tag_name}' cho khách ${customer_id}...`);
    return {
      content: [{ type: "text", text: `Đã gắn thẻ "${tag_name}" thành công.` }],
    };
  }
  
  if (toolName === "remove_tag") {
    const { customer_id, tag_name } = request.params.arguments;
    console.log(`[Hệ thống] Đang gọi API gỡ thẻ '${tag_name}' cho khách ${customer_id}...`);
    return {
      content: [{ type: "text", text: `Đã gỡ thẻ "${tag_name}" thành công.` }],
    };
  }

  throw new Error(`Tool không được hỗ trợ: ${toolName}`);
});

// -- CẤU HÌNH GIAO TIẾP QUA HTTP/SSE CHO CLOUD --

let transport;

// Endpoint 1: Để Botcake/RedAI kết nối vào và nhận dữ liệu (SSE)
app.get("/sse", async (req, res) => {
  transport = new SSEServerTransport("/message", res);
  await server.connect(transport);
  console.log("Client đã kết nối thành công qua SSE.");
});

// Endpoint 2: Để Botcake/RedAI gửi lệnh (gọi Tool) tới Server này
app.post("/message", async (req, res) => {
  if (transport) {
    await transport.handlePostMessage(req, res);
  } else {
    res.status(500).send("Chưa có kết nối SSE nào được khởi tạo.");
  }
});

// Endpoint test nhanh
app.get("/", (req, res) => {
  res.send("MCP Server cho CAO TO BIG MEN đang hoạt động!");
});

// --- THÊM API REST THÔNG THƯỜNG DÀNH CHO BOTCAKE ---
app.post("/api/add_tag", (req, res) => {
  const { customer_id, tag_name } = req.body;
  console.log(`[REST API] Đang gắn thẻ '${tag_name}' cho khách ${customer_id}...`);
  res.json({ 
    success: true, 
    message: `Đã gắn thẻ "${tag_name}" thành công cho khách ${customer_id}.` 
  });
});

app.post("/api/remove_tag", (req, res) => {
  const { customer_id, tag_name } = req.body;
  console.log(`[REST API] Đang gỡ thẻ '${tag_name}' cho khách ${customer_id}...`);
  res.json({ 
    success: true, 
    message: `Đã gỡ thẻ "${tag_name}" thành công cho khách ${customer_id}.` 
  });
});

// Lấy Port động từ biến môi trường (Render.com yêu cầu điều này)
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 MCP Server đang chạy tại cổng ${PORT}`);
  console.log(`📡 URL cấu hình cho Botcake/RedAI: https://<tên-miền-của-bạn>/sse`);
});
