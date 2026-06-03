package main

import (
	"flag"
	"fmt"
	"os"
	"path/filepath"
	"strings"
)

const version = "0.2.0"

func main() {
	var outputDir string
	var showVersion bool
	flag.StringVar(&outputDir, "o", "", "output directory (default: current directory)")
	flag.BoolVar(&showVersion, "version", false, "show version and exit")
	flag.BoolVar(&showVersion, "v", false, "show version and exit")
	flag.Usage = func() {
		fmt.Println("potocki v" + version + " - encrypted file drop downloader")
		fmt.Println()
		fmt.Println("Downloads, decrypts, decompresses, and verifies files from a potocki server.")
		fmt.Println()
		fmt.Println("Usage:")
		fmt.Println("  potocki [flags] <url> <token>")
		fmt.Println()
		fmt.Println("Flags:")
		fmt.Println("  -o <dir>      output directory (default: current directory)")
		fmt.Println("  -v, --version show version and exit")
		fmt.Println()
		fmt.Println("Arguments:")
		fmt.Println("  <url>      download URL, e.g. https://host/d/abc123")
		fmt.Println("  <token>    download token, e.g. fd_xxxx...")
		fmt.Println()
		fmt.Println("Examples:")
		fmt.Println("  potocki https://potocki.example.com/d/abc123 fd_your_token_here")
		fmt.Println("  potocki -o ~/Downloads https://potocki.example.com/d/abc123 fd_your_token_here")
		fmt.Println()
		fmt.Println("The client will automatically:")
		fmt.Println("  1. Fetch file info and decryption key")
		fmt.Println("  2. Download the encrypted file")
		fmt.Println("  3. Decrypt (AES-256-CBC)")
		fmt.Println("  4. Decompress (xz)")
		fmt.Println("  5. Verify SHA-256 checksum")
		fmt.Println()
		fmt.Println("Manual download via curl:")
		fmt.Println("  1. Get the decryption key:")
		fmt.Println("     curl \"https://host/api/key/abc123?token=fd_xxx...\"")
		fmt.Println()
		fmt.Println("  2. Download the encrypted file:")
		fmt.Println("     curl -o abc123.enc \"https://host/dl/abc123?token=fd_xxx...\"")
		fmt.Println()
		fmt.Println("  3. You will need to decrypt and decompress manually (openssl + xz).")
		fmt.Println("     Using the potocki client is recommended.")
		fmt.Println()
		fmt.Println("SHA-256 checksum is verified against the original file to ensure integrity.")
	}
	flag.Parse()

	if showVersion {
		fmt.Println("potocki v" + version)
		os.Exit(0)
	}

	args := flag.Args()
	if len(args) < 2 {
		flag.Usage()
		os.Exit(1)
	}

	fileURL := args[0]
	token := args[1]
	baseURL := extractBaseURL(fileURL)
	fileID := extractFileID(fileURL)

	if baseURL == "" || fileID == "" {
		fmt.Fprintln(os.Stderr, "Error: invalid URL. Expected format: https://host/d/<id>")
		os.Exit(1)
	}

	if outputDir != "" {
		if err := os.MkdirAll(outputDir, 0755); err != nil {
			fmt.Fprintf(os.Stderr, "Error: cannot create output directory: %v\n", err)
			os.Exit(1)
		}
	}

	if err := run(baseURL, fileID, token, outputDir); err != nil {
		fmt.Fprintf(os.Stderr, "Error: %v\n", err)
		os.Exit(1)
	}
}

func extractBaseURL(rawURL string) string {
	u := strings.TrimRight(rawURL, "/")
	if idx := strings.Index(u, "/d/"); idx >= 0 {
		return u[:idx]
	}
	if idx := strings.Index(u, "/dl/"); idx >= 0 {
		return u[:idx]
	}
	return ""
}

func extractFileID(rawURL string) string {
	u := strings.TrimRight(rawURL, "/")
	if idx := strings.Index(u, "/d/"); idx >= 0 {
		rem := u[idx+3:]
		if slashIdx := strings.Index(rem, "/"); slashIdx >= 0 {
			return rem[:slashIdx]
		}
		return rem
	}
	if idx := strings.Index(u, "/dl/"); idx >= 0 {
		rem := u[idx+4:]
		if slashIdx := strings.Index(rem, "/"); slashIdx >= 0 {
			return rem[:slashIdx]
		}
		return rem
	}
	return ""
}

func sanitizeFilename(name string) string {
	if name == "" {
		return "untitled"
	}
	name = strings.Map(func(r rune) rune {
		switch {
		case r < 32:
			return -1
		case r == '<' || r == '>' || r == '"' || r == '\'' || r == '&' ||
			r == '\\' || r == '/' || r == '|' || r == ':' || r == '*' || r == '?':
			return '_'
		default:
			return r
		}
	}, name)
	name = strings.TrimLeft(name, ".")
	if len(name) > 255 {
		name = name[:255]
	}
	if name == "" {
		return "untitled"
	}
	return name
}

func run(baseURL, fileID, token, outputDir string) error {
	fmt.Println("  potocki")
	fmt.Println("  --------")

	info, err := getFileInfo(baseURL, fileID)
	if err != nil {
		return fmt.Errorf("fetching file info: %w", err)
	}
	fmt.Printf("  file:   %s\n", info.Name)
	fmt.Printf("  size:   %s\n", formatBytes(info.Size))

	keyData, err := getFileKey(baseURL, fileID, token)
	if err != nil {
		return fmt.Errorf("fetching decryption key: %w", err)
	}

	encPath := filepath.Join(os.TempDir(), fileID+".enc")
	fmt.Printf("  download... ")
	n, err := downloadFile(baseURL, fileID, token, encPath)
	if err != nil {
		return fmt.Errorf("downloading: %w", err)
	}
	fmt.Printf("%s\n", formatBytes(n))

	fmt.Printf("  decrypt...   ")
	decPath, err := decryptFile(encPath, keyData.Key)
	if err != nil {
		return fmt.Errorf("decrypting: %w", err)
	}
	fmt.Println("OK")

	fmt.Printf("  decompress... ")
	outName := sanitizeFilename(info.Name)
	if outputDir != "" {
		outName = filepath.Join(outputDir, sanitizeFilename(info.Name))
	}
	if _, err := os.Stat(outName); err == nil {
		outName = filepath.Join(filepath.Dir(outName), fileID+"_"+info.Name)
	}
	if err := decompressXZ(decPath, outName); err != nil {
		return fmt.Errorf("decompressing: %w", err)
	}
	fmt.Println("OK")

	checksum := info.Sha256
	if checksum == "" {
		checksum = keyData.Sha256
	}
	if checksum != "" {
		fmt.Printf("  verify...    ")
		if err := verifyChecksum(outName, checksum); err != nil {
			fmt.Println("FAILED")
			return err
		}
		fmt.Println("OK")
	}

	os.Remove(encPath)
	os.Remove(decPath)

	abs, _ := filepath.Abs(outName)
	fmt.Printf("\n  saved:  %s\n", abs)
	if checksum != "" {
		fmt.Printf("  sha256: %s\n", checksum)
	}
	return nil
}

func formatBytes(b int64) string {
	const (
		KB = 1024
		MB = KB * 1024
		GB = MB * 1024
	)
	switch {
	case b >= GB:
		return fmt.Sprintf("%.1f GB", float64(b)/float64(GB))
	case b >= MB:
		return fmt.Sprintf("%.1f MB", float64(b)/float64(MB))
	case b >= KB:
		return fmt.Sprintf("%.1f KB", float64(b)/float64(KB))
	default:
		return fmt.Sprintf("%d B", b)
	}
}