package main

import (
	"fmt"
	"io"
	"os"

	"github.com/ulikunitz/xz"
)

const maxDecompressedSize = 2 * 1024 * 1024 * 1024 // 2GB max decompressed output

type limitedReader struct {
	reader io.Reader
	limit  int64
	read   int64
}

func (lr *limitedReader) Read(p []byte) (int, error) {
	n, err := lr.reader.Read(p)
	lr.read += int64(n)
	if lr.read > lr.limit {
		return n, fmt.Errorf("decompressed file exceeds maximum allowed size (%d GB)", lr.limit/(1024*1024*1024))
	}
	return n, err
}

func decompressXZ(xzPath, outPath string) error {
	xzFile, err := os.Open(xzPath)
	if err != nil {
		return fmt.Errorf("opening xz file: %w", err)
	}
	defer xzFile.Close()

	reader, err := xz.NewReader(xzFile)
	if err != nil {
		return fmt.Errorf("creating xz reader: %w", err)
	}

	limited := &limitedReader{reader: reader, limit: maxDecompressedSize}

	outFile, err := os.Create(outPath)
	if err != nil {
		return fmt.Errorf("creating output file: %w", err)
	}
	defer outFile.Close()

	written, err := io.Copy(outFile, limited)
	if err != nil {
		os.Remove(outPath)
		return fmt.Errorf("decompressing: %w", err)
	}

	if written == 0 {
		os.Remove(outPath)
		return fmt.Errorf("decompressed file is empty")
	}

	return nil
}