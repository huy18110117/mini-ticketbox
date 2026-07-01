using MiniTicketBox.Domain.Entities;

namespace MiniTicketBox.UnitTests;

public class TicketTypeTests
{
    [Fact]
    public void Reserve_WhenQuantityIsGreaterThanAvailable_ThrowsAndDoesNotOversell()
    {
        var ticketType = new TicketType("Standard", 100_000, 2);

        var exception = Assert.Throws<InvalidOperationException>(() => ticketType.Reserve(3));

        Assert.Equal("Không đủ vé khả dụng.", exception.Message);
        Assert.Equal(2, ticketType.AvailableQuantity);
    }

    [Fact]
    public void Reserve_WhenQuantityIsValid_DecreasesAvailableQuantityAtomicallyInDomain()
    {
        var ticketType = new TicketType("VIP", 250_000, 10);

        ticketType.Reserve(4);

        Assert.Equal(6, ticketType.AvailableQuantity);
    }

    [Fact]
    public void Release_WhenQuantityWouldExceedTotal_CapsAvailableQuantityAtTotal()
    {
        var ticketType = new TicketType("Early Bird", 80_000, 5);
        ticketType.Reserve(1);

        ticketType.Release(10);

        Assert.Equal(5, ticketType.AvailableQuantity);
    }
}
