using System.ComponentModel.DataAnnotations;

namespace MiniTicketBox.Application.Contracts.Requests;

public class PaymentRequest
{
    [Required(ErrorMessage = "Mã giữ vé là bắt buộc.")]
    [StringLength(32, MinimumLength = 6, ErrorMessage = "Mã giữ vé không hợp lệ.")]
    public string HoldCode { get; set; } = string.Empty;

    [Required(ErrorMessage = "Tên khách hàng là bắt buộc.")]
    [StringLength(120, MinimumLength = 2, ErrorMessage = "Tên khách hàng phải có ít nhất 2 ký tự.")]
    public string CustomerName { get; set; } = string.Empty;

    [Required(ErrorMessage = "Email khách hàng là bắt buộc.")]
    [EmailAddress(ErrorMessage = "Email khách hàng không hợp lệ.")]
    [StringLength(254, ErrorMessage = "Email khách hàng quá dài.")]
    public string CustomerEmail { get; set; } = string.Empty;
}
