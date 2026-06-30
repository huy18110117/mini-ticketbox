using MiniTicketBox.Application.Contracts.Responses;
using MiniTicketBox.Application.Realtime;

namespace MiniTicketBox.UnitTests;

public class TicketInventoryRealtimeTests
{
    [Fact]
    public async Task RecordingNotifier_StoresRealtimeBroadcastReasonAndSnapshot()
    {
        var notifier = new RecordingTicketRealtimeNotifier();
        var snapshot = new TicketInventorySnapshotResponse
        {
            TotalAvailable = 497,
            TotalHolding = 3,
            TotalSold = 0,
            Revenue = 0,
            ServerTimeUtc = DateTime.UtcNow
        };

        await notifier.BroadcastInventoryChangedAsync("reserved", snapshot);

        Assert.Single(notifier.Broadcasts);
        Assert.Equal("reserved", notifier.Broadcasts[0].Reason);
        Assert.Same(snapshot, notifier.Broadcasts[0].Snapshot);
        Assert.Equal(497, notifier.Broadcasts[0].Snapshot.TotalAvailable);
        Assert.Equal(3, notifier.Broadcasts[0].Snapshot.TotalHolding);
    }

    [Theory]
    [InlineData("reserved")]
    [InlineData("paid")]
    [InlineData("released")]
    public async Task RecordingNotifier_AcceptsAllInventoryChangeReasons(string reason)
    {
        var notifier = new RecordingTicketRealtimeNotifier();

        await notifier.BroadcastInventoryChangedAsync(reason, new TicketInventorySnapshotResponse());

        Assert.Equal(reason, notifier.Broadcasts.Single().Reason);
    }

    private sealed class RecordingTicketRealtimeNotifier : ITicketRealtimeNotifier
    {
        public List<(string Reason, TicketInventorySnapshotResponse Snapshot)> Broadcasts { get; } = new();

        public Task BroadcastInventoryChangedAsync(
            string reason,
            TicketInventorySnapshotResponse snapshot,
            CancellationToken cancellationToken = default)
        {
            Broadcasts.Add((reason, snapshot));
            return Task.CompletedTask;
        }
    }
}
