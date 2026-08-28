package resource

import (
	"fmt"
	"os"

	"github.com/google/uuid"

	"github.com/grafana/grafana/pkg/setting"
)

// ResolveLeaseHolder builds a stable-per-process identifier for KV lease
// ownership. Exported so wirings outside this package produce the same format.
func ResolveLeaseHolder(cfg *setting.Cfg) string {
	if cfg != nil && cfg.InstanceID != "" {
		return fmt.Sprintf("%s-%s", cfg.InstanceID, uuid.NewString())
	}
	return defaultLeaseHolder()
}

// defaultLeaseHolder is used when a caller builds a backend without a holder.
func defaultLeaseHolder() string {
	hostname, err := os.Hostname()
	if err != nil || hostname == "" {
		hostname = "unknown"
	}
	return fmt.Sprintf("%s-%s", hostname, uuid.NewString())
}
