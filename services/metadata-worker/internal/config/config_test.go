package config

import (
	"net/netip"
	"testing"
)

func TestParseHostResolveOverrides(t *testing.T) {
	overrides, err := parseHostResolveOverrides(" EricJYPark.com. = 10.42.0.1, www.ericjypark.com=100.70.250.1 ")
	if err != nil {
		t.Fatal(err)
	}

	if got := overrides["ericjypark.com"][0]; got != netip.MustParseAddr("10.42.0.1") {
		t.Fatalf("unexpected ericjypark.com override: %s", got)
	}
	if got := overrides["www.ericjypark.com"][0]; got != netip.MustParseAddr("100.70.250.1") {
		t.Fatalf("unexpected www.ericjypark.com override: %s", got)
	}
}

func TestParseHostResolveOverridesRejectsInvalidEntries(t *testing.T) {
	cases := []string{
		"ericjypark.com",
		"=10.42.0.1",
		"ericjypark.com=not-an-ip",
	}

	for _, value := range cases {
		if _, err := parseHostResolveOverrides(value); err == nil {
			t.Fatalf("expected %q to fail", value)
		}
	}
}
