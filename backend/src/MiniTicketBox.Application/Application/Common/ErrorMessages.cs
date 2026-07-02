namespace MiniTicketBox.Application.Common;

public static class ErrorMessages
{
    public const string TicketTypeRequired = "Mã loại vé là bắt buộc.";
    public const string QuantityInvalid = "Số lượng phải lớn hơn 0.";
    public const string TicketTypeNotFound = "Không tìm thấy loại vé.";
    public const string NotEnoughTickets = "Không đủ vé khả dụng.";
    public const string HoldCodeRequired = "Mã giữ vé là bắt buộc.";
    public const string CustomerNameRequired = "Tên khách hàng là bắt buộc.";
    public const string CustomerEmailInvalid = "Email khách hàng không hợp lệ.";
    public const string TicketHoldNotFound = "Không tìm thấy lượt giữ vé.";
    public const string TicketHoldPaymentUnavailable = "Lượt giữ vé không khả dụng để thanh toán.";
    public const string TicketHoldCancellationUnavailable = "Lượt giữ vé không còn khả dụng để hủy.";
    public const string TicketHoldExpired = "Lượt giữ vé đã hết hạn.";
    public const string SystemError = "Lỗi hệ thống. Vui lòng thử lại sau.";
}
