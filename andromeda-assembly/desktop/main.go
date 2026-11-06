// Andromeda Assembly desktop launcher (Windows).
//
// The whole game is a single offline HTML file embedded in this executable. On
// launch it is unpacked to %LOCALAPPDATA%\Andromeda Insights\Andromeda Assembly
// and opened in a chrome-less app window (Microsoft Edge, which ships with
// Windows, or Chrome) using a private profile, so saves live with the app and
// the window looks and behaves like a native program.
package main

import (
	"bytes"
	_ "embed"
	"net/url"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"syscall"
	"unsafe"
)

//go:embed game/index.html
var game []byte

const (
	appName = "Andromeda Assembly"
	vendor  = "Andromeda Insights"
)

var (
	user32       = syscall.NewLazyDLL("user32.dll")
	shell32      = syscall.NewLazyDLL("shell32.dll")
	messageBoxW  = user32.NewProc("MessageBoxW")
	shellExecute = shell32.NewProc("ShellExecuteW")
)

func u16(s string) *uint16 { p, _ := syscall.UTF16PtrFromString(s); return p }

func fatal(msg string) {
	messageBoxW.Call(0, uintptr(unsafe.Pointer(u16(msg))), uintptr(unsafe.Pointer(u16(appName))), 0x10)
	os.Exit(1)
}

func dataDir() string {
	base := os.Getenv("LOCALAPPDATA")
	if base == "" {
		base = os.TempDir()
	}
	return filepath.Join(base, vendor, appName)
}

// unpack writes the embedded game next to the profile, only when it changed.
func unpack(dir string) string {
	appDir := filepath.Join(dir, "app")
	if err := os.MkdirAll(appDir, 0o755); err != nil {
		fatal("Could not create the game folder:\n" + appDir + "\n\n" + err.Error())
	}
	page := filepath.Join(appDir, "index.html")
	if cur, err := os.ReadFile(page); err != nil || !bytes.Equal(cur, game) {
		if err := os.WriteFile(page, game, 0o644); err != nil {
			fatal("Could not unpack the game:\n" + page + "\n\n" + err.Error())
		}
	}
	return page
}

func findBrowser() string {
	roots := []string{os.Getenv("ProgramFiles(x86)"), os.Getenv("ProgramFiles"), os.Getenv("LOCALAPPDATA")}
	rels := []string{
		`Microsoft\Edge\Application\msedge.exe`,
		`Google\Chrome\Application\chrome.exe`,
		`BraveSoftware\Brave-Browser\Application\brave.exe`,
	}
	for _, rel := range rels {
		for _, root := range roots {
			if root == "" {
				continue
			}
			p := filepath.Join(root, rel)
			if st, err := os.Stat(p); err == nil && !st.IsDir() {
				return p
			}
		}
	}
	if p, err := exec.LookPath("msedge.exe"); err == nil {
		return p
	}
	return ""
}

func fileURL(p string) string {
	u := url.URL{Scheme: "file", Path: "/" + filepath.ToSlash(p)}
	return u.String()
}

func main() {
	dir := dataDir()
	page := unpack(dir)
	link := fileURL(page)

	if browser := findBrowser(); browser != "" {
		args := []string{
			"--app=" + link,
			"--user-data-dir=" + filepath.Join(dir, "Profile"),
			"--no-first-run",
			"--no-default-browser-check",
			"--start-maximized",
			"--autoplay-policy=no-user-gesture-required",
			"--overscroll-history-navigation=0",
			"--disable-pinch",
			"--disable-features=Translate,msEdgeSidebarV2,msUndersideButton,msHubApps",
			"--disable-sync",
		}
		for _, a := range os.Args[1:] {
			if strings.HasPrefix(a, "--") {
				args = append(args, a) // e.g. --start-fullscreen
			}
		}
		cmd := exec.Command(browser, args...)
		if err := cmd.Start(); err == nil {
			cmd.Wait() // stay alive while the game window is open
			return
		}
	}
	// Fallback: the default browser.
	r, _, _ := shellExecute.Call(0, uintptr(unsafe.Pointer(u16("open"))), uintptr(unsafe.Pointer(u16(page))), 0, 0, 1)
	if r <= 32 {
		fatal("Andromeda Assembly needs Microsoft Edge or another modern browser to run.")
	}
}
