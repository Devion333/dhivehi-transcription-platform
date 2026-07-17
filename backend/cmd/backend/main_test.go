package main

import "testing"

func TestAllowedOriginExactMatch(t *testing.T) {
	t.Setenv("FRONTEND_ORIGIN", "http://localhost:3000,https://app.example.com")
	if !isAllowedOrigin("https://app.example.com") {
		t.Fatal("expected configured origin to be allowed")
	}
	if isAllowedOrigin("https://evil-app.example.com") || isAllowedOrigin("https://app.example.com.evil.test") {
		t.Fatal("origin matching must be exact")
	}
}

func TestTrustedBrowserOrigin(t *testing.T) {
	t.Setenv("FRONTEND_ORIGIN", "http://localhost:3000")
	if !isTrustedBrowserOrigin("http://localhost:3000", "") {
		t.Fatal("expected approved origin")
	}
	if isTrustedBrowserOrigin("http://evil.example", "") {
		t.Fatal("expected unapproved origin to be rejected")
	}
	if !isTrustedBrowserOrigin("", "http://localhost:3000/Transcripts") {
		t.Fatal("expected approved referer")
	}
	if isTrustedBrowserOrigin("", "http://localhost:3000.evil.example/Transcripts") {
		t.Fatal("expected suffix-style referer to be rejected")
	}
	if !isTrustedBrowserOrigin("", "") {
		t.Fatal("expected non-browser requests without origin or referer to be allowed")
	}
}
