namespace MiniTicketBox.Application.Common;

public sealed class TicketHoldOptions
{
    public const string SectionName = "TicketHold";

    public int HoldDurationMinutes { get; set; } = 5;

    public int ExpirationScanIntervalSeconds { get; set; } = 30;

    public TimeSpan HoldDuration => TimeSpan.FromMinutes(HoldDurationMinutes);

    public TimeSpan ExpirationScanInterval => TimeSpan.FromSeconds(ExpirationScanIntervalSeconds);
}
