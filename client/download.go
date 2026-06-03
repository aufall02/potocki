package main

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"strings"
)

type fileInfo struct {
	ID       string `json:"id"`
	Name     string `json:"name"`
	Size     int64  `json:"size"`
	CompSize int64  `json:"compSize"`
	Sha256   string `json:"sha256"`
	Expires  int64  `json:"expires"`
}

type fileKey struct {
	Key    string `json:"key"`
	IV     string `json:"iv"`
	Name   string `json:"name"`
	Sha256 string `json:"sha256"`
}

func getFileInfo(baseURL, fileID string) (*fileInfo, error) {
	url := strings.TrimRight(baseURL, "/") + "/api/info/" + fileID
	resp, err := http.Get(url)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != 200 {
		body, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("server returned %d: %s", resp.StatusCode, string(body))
	}

	var info fileInfo
	if err := json.NewDecoder(resp.Body).Decode(&info); err != nil {
		return nil, fmt.Errorf("parsing response: %w", err)
	}
	return &info, nil
}

func getFileKey(baseURL, fileID, token string) (*fileKey, error) {
	url := strings.TrimRight(baseURL, "/") + "/api/key/" + fileID + "?token=" + token
	resp, err := http.Get(url)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != 200 {
		body, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("server returned %d: %s", resp.StatusCode, string(body))
	}

	var key fileKey
	if err := json.NewDecoder(resp.Body).Decode(&key); err != nil {
		return nil, fmt.Errorf("parsing response: %w", err)
	}
	return &key, nil
}

func downloadFile(baseURL, fileID, token, destPath string) (int64, error) {
	url := strings.TrimRight(baseURL, "/") + "/dl/" + fileID + "?token=" + token
	resp, err := http.Get(url)
	if err != nil {
		return 0, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != 200 {
		body, _ := io.ReadAll(resp.Body)
		return 0, fmt.Errorf("server returned %d: %s", resp.StatusCode, string(body))
	}

	f, err := os.Create(destPath)
	if err != nil {
		return 0, err
	}
	defer f.Close()

	written, err := io.Copy(f, resp.Body)
	if err != nil {
		os.Remove(destPath)
		return 0, err
	}
	return written, nil
}