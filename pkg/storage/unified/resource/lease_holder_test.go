package resource

import (
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

	"github.com/grafana/grafana/pkg/setting"
)

func TestResolveLeaseHolder(t *testing.T) {
	t.Run("prefers the configured instance ID", func(t *testing.T) {
		const instanceID = "storage-instance"
		holder := ResolveLeaseHolder(&setting.Cfg{InstanceID: instanceID})

		require.Equal(t, instanceID, requireValidLeaseHolderUUID(t, holder))
	})

	t.Run("defaults when no instance ID is configured", func(t *testing.T) {
		holder := ResolveLeaseHolder(&setting.Cfg{})

		require.NotEmpty(t, requireValidLeaseHolderUUID(t, holder))
	})
}

func requireValidLeaseHolderUUID(t *testing.T, holder string) string {
	t.Helper()
	uuidLength := len(uuid.Nil.String())
	require.Greater(t, len(holder), uuidLength+1)
	separatorIndex := len(holder) - uuidLength - 1
	require.Equal(t, byte('-'), holder[separatorIndex])
	_, err := uuid.Parse(holder[separatorIndex+1:])
	require.NoError(t, err)
	return holder[:separatorIndex]
}
