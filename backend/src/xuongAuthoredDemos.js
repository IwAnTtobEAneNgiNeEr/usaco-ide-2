"use strict";

// Demo-first for the ten authored arcs (docs/HANDOVER.md §6).
//
// A demo is NOT a verifier. It compiles the student's current implementation
// with one read-only harness and prints, in Vietnamese, three things: the
// situation, what came out, and why the algorithm is there at all. It runs
// before any requirement is opened, so a student sees a living product before
// being asked to change one.
//
// Every number these demos print comes from the student's own source, which
// means on the red baseline they print the wrong-but-honest value. That is the
// point: the demo shows the product working, the scenario shows what it gets
// wrong.

const AUTHORED_DEMOS = {
  "build-order-tree": {
    title: "Xem chuỗi build dài nhất của một dự án",
    description: "Chạy thử công cụ đo độ sâu build trên bảng phụ thuộc 7 module để thấy chuỗi nào quyết định thời gian build.",
    mission: "Đọc interface deepestChain và source hiện tại, chạy demo để thấy công cụ đang báo chuỗi dài bao nhiêu bậc.",
    acceptance: "Compiler biên dịch project thật; scenario và oracle cục bộ cùng xác nhận số bậc của chuỗi dài nhất.",
    requirements: [
      "deepestChain trả 0 cho module không có phụ thuộc nào.",
      "Chuỗi app → api → core → logging phải được đo đủ ba bậc.",
    ],
    source: `#include "BuildOrderTree.hpp"
#include <iostream>
int main() {
  std::vector<std::pair<std::string, std::string>> edges = {
      {"app", "api"}, {"app", "ui"}, {"api", "core"}, {"api", "db"},
      {"ui", "theme"}, {"core", "logging"}};
  std::cout << "TÌNH HUỐNG: Đội cần biết chuỗi build nào dài nhất để rút thời gian chờ.\\n";
  std::cout << "BẢNG BUILD: 7 module, 6 quan hệ phụ thuộc, gốc là app.\\n";
  std::cout << "KẾT QUẢ: Chuỗi dài nhất = " << BuildOrderTree::deepestChain(edges, "app") << " bậc\\n";
  std::cout << "VAI TRÒ THUẬT TOÁN: Duyệt cây phụ thuộc thay vì đếm tay từng nhánh.\\n";
}
`,
  },

  "prefix-router-tree": {
    title: "Xem tổng đài chọn tuyến cho một số máy",
    description: "Chạy thử bộ định tuyến trên bảng 6 tiền tố để thấy số 842421357 đang được đẩy về tuyến nào.",
    mission: "Đọc interface longestPrefixMatch và source hiện tại, chạy demo để thấy tuyến đang được chọn.",
    acceptance: "Compiler biên dịch project thật; scenario và oracle cục bộ cùng xác nhận độ dài tiền tố được chọn.",
    requirements: [
      "Số không khớp tiền tố nào phải trả 0.",
      "Số 842421357 phải chọn tiền tố dài nhất trong bảng.",
    ],
    source: `#include "PrefixRouter.hpp"
#include <iostream>
int main() {
  std::vector<std::string> table = {"84", "8424", "84242", "8", "8425", "849"};
  std::cout << "TÌNH HUỐNG: Tổng đài phải đẩy cuộc gọi về đúng nhánh chi tiết nhất.\\n";
  std::cout << "BẢNG TUYẾN: 6 tiền tố, số gọi là 842421357.\\n";
  std::cout << "KẾT QUẢ: Tiền tố được chọn dài " << PrefixRouter::longestPrefixMatch(table, "842421357") << " ký tự\\n";
  std::cout << "VAI TRÒ THUẬT TOÁN: Chọn tuyến chi tiết nhất thay vì tuyến gặp đầu tiên.\\n";
}
`,
  },

  "shift-planner-timeline": {
    title: "Xem tổng số phút chồng ca của bảng phân công",
    description: "Chạy thử công cụ đối chiếu ca trực trên bảng 6 ca để thấy nhân sự đang trùng nhau bao nhiêu phút.",
    mission: "Đọc interface overlapMinutes và source hiện tại, chạy demo để thấy tổng phút chồng ca đang được báo.",
    acceptance: "Compiler biên dịch project thật; scenario và oracle cục bộ cùng xác nhận tổng phút chồng ca.",
    requirements: [
      "Hai ca không giao nhau phải đóng góp 0 phút.",
      "Tổng phải cộng phần chồng của mọi cặp ca trong bảng.",
    ],
    source: `#include "ShiftPlanner.hpp"
#include <iostream>
int main() {
  std::vector<std::pair<int, int>> shifts = {
      {0, 120}, {60, 180}, {100, 200}, {240, 300}, {280, 360}, {400, 460}};
  std::cout << "TÌNH HUỐNG: Quản lý cần biết bảng phân ca đang trả thừa bao nhiêu công.\\n";
  std::cout << "BẢNG CA: 6 ca trực tính theo phút, từ phút 0 tới phút 460.\\n";
  std::cout << "KẾT QUẢ: Tổng phút chồng ca = " << ShiftPlanner::overlapMinutes(shifts) << " phút\\n";
  std::cout << "VAI TRÒ THUẬT TOÁN: Đo phần giao của các khoảng thời gian thay vì dò bằng mắt.\\n";
}
`,
  },

  "sweep-monitor-timeline": {
    title: "Xem đỉnh phiên truy cập đồng thời trong ngày",
    description: "Chạy thử bảng theo dõi trên nhật ký 6 phiên để thấy hệ thống đang báo cao điểm bao nhiêu phiên.",
    mission: "Đọc interface peakConcurrency và source hiện tại, chạy demo để thấy đỉnh đang được báo.",
    acceptance: "Compiler biên dịch project thật; scenario và oracle cục bộ cùng xác nhận số phiên đồng thời cao nhất.",
    requirements: [
      "Nhật ký rỗng phải trả 0.",
      "Đỉnh phải là số phiên cùng mở lớn nhất trong cả ngày.",
    ],
    source: `#include "SweepMonitor.hpp"
#include <iostream>
int main() {
  std::vector<std::pair<int, int>> sessions = {
      {0, 10}, {5, 15}, {100, 200}, {110, 210}, {120, 220}, {130, 230}};
  std::cout << "TÌNH HUỐNG: Đội vận hành cần biết máy chủ phải chịu tải cao nhất bao nhiêu.\\n";
  std::cout << "NHẬT KÝ: 6 phiên, hai phiên sáng sớm và bốn phiên khung trưa.\\n";
  std::cout << "KẾT QUẢ: Đỉnh phiên đồng thời = " << SweepMonitor::peakConcurrency(sessions) << " phiên\\n";
  std::cout << "VAI TRÒ THUẬT TOÁN: Quét mốc sự kiện thay vì đoán theo phiên đầu tiên.\\n";
}
`,
  },

  "field-survey-geometry": {
    title: "Xem vùng phủ sóng của một cột phát",
    description: "Chạy thử bản đồ phủ sóng trên 6 trạm khảo sát để thấy cột phát đang được coi là phủ tới đâu.",
    mission: "Đọc interface withinRange và source hiện tại, chạy demo để thấy số trạm đang được báo có sóng.",
    acceptance: "Compiler biên dịch project thật; scenario và oracle cục bộ cùng xác nhận số trạm trong bán kính.",
    requirements: [
      "Trạm nằm đúng trên đường bán kính vẫn được tính là có sóng.",
      "Trạm ở góc ngoài đường tròn không được tính.",
    ],
    source: `#include "FieldSurvey.hpp"
#include <iostream>
int main() {
  std::vector<std::pair<double, double>> points = {
      {1.0, 1.0}, {4.5, 0.5}, {4.5, 4.5}, {-3.0, 4.0}, {0.0, -4.8}, {-4.9, -4.9}};
  std::cout << "TÌNH HUỐNG: Xã cần biết cột phát mới phủ được bao nhiêu trạm.\\n";
  std::cout << "KHẢO SÁT: 6 trạm quanh cột phát tại (0,0), bán kính thiết kế 5 km.\\n";
  std::cout << "KẾT QUẢ: Số trạm trong vùng phủ = " << FieldSurvey::withinRange(points, 0.0, 0.0, 5.0) << " trạm\\n";
  std::cout << "VAI TRÒ THUẬT TOÁN: Đo khoảng cách thật thay vì ước lượng bằng khung bao.\\n";
}
`,
  },

  "api-gateway-exchange": {
    title: "Xem cổng API trả mã gì cho từng đường dẫn",
    description: "Chạy thử cổng API trên 6 lượt gọi để thấy phía gọi đang nhận về mã trạng thái nào.",
    mission: "Đọc interface statusFor và source hiện tại, chạy demo để thấy tổng mã trạng thái đang được trả.",
    acceptance: "Compiler biên dịch project thật; scenario và oracle cục bộ cùng xác nhận mã trạng thái của từng đường dẫn.",
    requirements: [
      "Đường dẫn không có trong bảng phải trả 404.",
      "Đường dẫn thuộc dịch vụ đang tắt không được báo thành công.",
    ],
    source: `#include "ApiGateway.hpp"
#include <iostream>
int main() {
  std::vector<std::pair<std::string, std::string>> table = {
      {"/don-hang", "orders"}, {"/thanh-toan", "billing"}, {"/kho", "stock"},
      {"/nguoi-dung", "users"}, {"/bao-cao", "reports"}};
  std::set<std::string> down = {"billing", "reports"};
  const char* paths[] = {"/don-hang", "/thanh-toan", "/kho", "/nguoi-dung", "/bao-cao", "/cu"};
  std::cout << "TÌNH HUỐNG: Hai dịch vụ đang bảo trì, phía gọi cần biết sự thật đó.\\n";
  std::cout << "LƯỢT GỌI: 6 đường dẫn qua cổng, billing và reports đang tắt.\\n";
  for (const char* path : paths) {
    std::cout << "  " << path << " -> " << ApiGateway::statusFor(table, path, down) << "\\n";
  }
  std::cout << "VAI TRÒ THUẬT TOÁN: Tra bảng định tuyến rồi đối chiếu trạng thái dịch vụ.\\n";
}
`,
  },

  "retry-budget-exchange": {
    title: "Xem chính sách thử lại tiêu bao nhiêu lượt gọi",
    description: "Chạy thử chính sách thử lại trên 6 phản hồi để thấy client đang tốn bao nhiêu lượt gọi mạng.",
    mission: "Đọc interface retryable và source hiện tại, chạy demo để thấy tổng lượt gọi đang bị tiêu.",
    acceptance: "Compiler biên dịch project thật; scenario và oracle cục bộ cùng xác nhận tổng lượt gọi.",
    requirements: [
      "Phản hồi 200 không bao giờ được thử lại.",
      "Tổng lượt gọi phải phản ánh đúng chính sách đang áp dụng.",
    ],
    source: `#include "RetryBudget.hpp"
#include <iostream>
int main() {
  std::vector<int> statuses = {500, 404, 503, 200, 429, 500};
  std::cout << "TÌNH HUỐNG: Hoá đơn mạng tăng vì client thử lại quá nhiều.\\n";
  std::cout << "PHẢN HỒI: 500, 404, 503, 200, 429, 500 với ngân sách 2 lần thử lại.\\n";
  std::cout << "KẾT QUẢ: Tổng lượt gọi = " << RetryBudget::attemptsUsed(statuses, 2) << " lượt\\n";
  std::cout << "VAI TRÒ THUẬT TOÁN: Phân loại lỗi trước khi quyết định có thử lại hay không.\\n";
}
`,
  },

  "memory-pool-runtime": {
    title: "Xem bộ cấp phát xin bao nhiêu trang bộ nhớ",
    description: "Chạy thử bộ cấp phát trên 6 khối dữ liệu để thấy chương trình đang xin bao nhiêu trang 4096 byte.",
    mission: "Đọc interface pagesNeeded và source hiện tại, chạy demo để thấy số trang đang được xin.",
    acceptance: "Compiler biên dịch project thật; scenario và oracle cục bộ cùng xác nhận số trang cần cấp.",
    requirements: [
      "Khối nhỏ hơn một trang vẫn phải được tính đủ một trang.",
      "Số trang phải khớp với cách trình cấp phát thật chia trang.",
    ],
    source: `#include "MemoryPool.hpp"
#include <iostream>
int main() {
  std::vector<long long> blocks = {1000, 3000, 500, 4096, 100, 2500};
  std::cout << "TÌNH HUỐNG: Chương trình bị thiếu bộ nhớ dù bảng tính nói là đủ.\\n";
  std::cout << "DỮ LIỆU: 6 khối, tổng 11196 byte, mỗi trang 4096 byte.\\n";
  std::cout << "KẾT QUẢ: Số trang cần cấp = " << MemoryPool::pagesNeeded(blocks, 4096) << " trang\\n";
  std::cout << "VAI TRÒ THUẬT TOÁN: Làm tròn theo đơn vị cấp phát thật thay vì theo tổng byte.\\n";
}
`,
  },

  "order-flow-state": {
    title: "Xem vòng đời đơn hàng chấp nhận bước nào",
    description: "Chạy thử bảng trạng thái trên 6 lần thử chuyển để thấy hệ thống đang cho phép những bước nào.",
    mission: "Đọc interface canTransition và bảng chuyển hiện tại, chạy demo để thấy bước nào bị từ chối.",
    acceptance: "Compiler biên dịch project thật; scenario và oracle cục bộ cùng xác nhận số bước hợp lệ.",
    requirements: [
      "Bước quay ngược về chờ xác nhận luôn phải bị từ chối.",
      "Số bước hợp lệ phải khớp với bảng chuyển đang khai báo.",
    ],
    source: `#include "OrderFlow.hpp"
#include <iostream>
int main() {
  std::vector<std::pair<std::string, std::string>> attempts = {
      {"cho-xac-nhan", "dang-goi"}, {"dang-goi", "dang-giao"},
      {"dang-giao", "da-giao"}, {"da-giao", "hoan-hang"},
      {"da-giao", "cho-xac-nhan"}, {"hoan-hang", "dang-giao"}};
  std::cout << "TÌNH HUỐNG: Khách xin hoàn hàng sau khi đã nhận, hệ thống phải trả lời được.\\n";
  std::cout << "VÒNG ĐỜI: 6 lần thử chuyển trạng thái đơn hàng.\\n";
  for (const auto& step : attempts) {
    std::cout << "  " << step.first << " -> " << step.second << " : "
              << (OrderFlow::canTransition(step.first, step.second) ? "cho phep" : "tu choi") << "\\n";
  }
  std::cout << "VAI TRÒ THUẬT TOÁN: Bảng chuyển tiếp giữ đơn hàng không rơi vào trạng thái vô lý.\\n";
}
`,
  },

  "ledger-audit-table": {
    title: "Xem tổng chênh lệch giữa sổ và sao kê",
    description: "Chạy thử bảng đối soát trên 6 dòng sổ để thấy công cụ đang báo lệch bao nhiêu.",
    mission: "Đọc interface mismatchTotal và source hiện tại, chạy demo để thấy tổng lệch đang được báo.",
    acceptance: "Compiler biên dịch project thật; scenario và oracle cục bộ cùng xác nhận tổng chênh lệch.",
    requirements: [
      "Dòng khớp tuyệt đối không được cộng vào tổng.",
      "Tổng phải phản ánh lệch theo cả hai chiều.",
    ],
    source: `#include "LedgerAudit.hpp"
#include <iostream>
int main() {
  std::vector<std::pair<long long, long long>> rows = {
      {1200, 1200}, {800, 950}, {2400, 2310}, {500, 500}, {1750, 1900}, {620, 500}};
  std::cout << "TÌNH HUỐNG: Kế toán cần biết sổ nội bộ lệch sao kê ngân hàng bao nhiêu.\\n";
  std::cout << "SỔ: 6 dòng, mỗi dòng là cặp {sổ nội bộ, sao kê}.\\n";
  std::cout << "KẾT QUẢ: Tổng chênh lệch = " << LedgerAudit::mismatchTotal(rows) << " nghìn\\n";
  std::cout << "VAI TRÒ THUẬT TOÁN: Cộng lệch theo trị tuyệt đối để không bỏ sót chiều nào.\\n";
}
`,
  },
};

module.exports = { AUTHORED_DEMOS };
