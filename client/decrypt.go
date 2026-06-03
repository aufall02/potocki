package main

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"os"
	"strings"
)

func decryptFile(encPath, keyHex string) (string, error) {
	data, err := os.ReadFile(encPath)
	if err != nil {
		return "", fmt.Errorf("reading file: %w", err)
	}

	if len(data) < aes.BlockSize+1 {
		return "", fmt.Errorf("file too small")
	}

	key, err := hex.DecodeString(keyHex)
	if err != nil {
		return "", fmt.Errorf("invalid key hex: %w", err)
	}

	iv := data[:aes.BlockSize]
	ciphertext := data[aes.BlockSize:]

	if len(ciphertext)%aes.BlockSize != 0 {
		return "", fmt.Errorf("ciphertext not aligned to block size")
	}

	block, err := aes.NewCipher(key)
	if err != nil {
		return "", fmt.Errorf("creating cipher: %w", err)
	}

	mode := cipher.NewCBCDecrypter(block, iv)
	plaintext := make([]byte, len(ciphertext))
	mode.CryptBlocks(plaintext, ciphertext)

	plaintext, err = pkcs7Unpad(plaintext)
	if err != nil {
		return "", fmt.Errorf("unpadding: %w", err)
	}

	decPath := strings.TrimSuffix(encPath, ".enc") + ".xz"
	if err := os.WriteFile(decPath, plaintext, 0644); err != nil {
		return "", fmt.Errorf("writing file: %w", err)
	}

	return decPath, nil
}

func pkcs7Unpad(data []byte) ([]byte, error) {
	if len(data) == 0 {
		return nil, fmt.Errorf("empty data")
	}
	padLen := int(data[len(data)-1])
	if padLen == 0 || padLen > aes.BlockSize {
		return nil, fmt.Errorf("invalid padding: %d", padLen)
	}
	for i := len(data) - padLen; i < len(data); i++ {
		if data[i] != byte(padLen) {
			return nil, fmt.Errorf("inconsistent padding")
		}
	}
	return data[:len(data)-padLen], nil
}

func verifyChecksum(filePath, expectedHex string) error {
	data, err := os.ReadFile(filePath)
	if err != nil {
		return fmt.Errorf("reading file for checksum: %w", err)
	}

	hash := sha256.Sum256(data)
	actual := hex.EncodeToString(hash[:])

	if !strings.EqualFold(actual, expectedHex) {
		return fmt.Errorf("SHA-256 mismatch!\n  expected: %s\n  actual:   %s", expectedHex, actual)
	}

	return nil
}