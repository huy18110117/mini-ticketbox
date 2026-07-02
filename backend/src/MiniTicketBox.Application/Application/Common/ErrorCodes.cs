namespace MiniTicketBox.Application.Common;

public static class ErrorCodes
{
    public const string ValidationError = "VALIDATION_ERROR";
    public const string TicketTypeRequired = "TICKET_TYPE_REQUIRED";
    public const string QuantityInvalid = "QUANTITY_INVALID";
    public const string TicketTypeNotFound = "TICKET_TYPE_NOT_FOUND";
    public const string NotEnoughTickets = "NOT_ENOUGH_TICKETS";
    public const string HoldCodeRequired = "HOLD_CODE_REQUIRED";
    public const string CustomerNameRequired = "CUSTOMER_NAME_REQUIRED";
    public const string CustomerEmailInvalid = "CUSTOMER_EMAIL_INVALID";
    public const string TicketHoldNotFound = "TICKET_HOLD_NOT_FOUND";
    public const string TicketHoldPaymentUnavailable = "TICKET_HOLD_PAYMENT_UNAVAILABLE";
    public const string TicketHoldCancellationUnavailable = "TICKET_HOLD_CANCELLATION_UNAVAILABLE";
    public const string TicketHoldExpired = "TICKET_HOLD_EXPIRED";
    public const string SystemError = "SYSTEM_ERROR";
}
