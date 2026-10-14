#ifndef POCKET_ARCADE_CRYPTO_H
#define POCKET_ARCADE_CRYPTO_H

#include <stddef.h>
#include <stdint.h>

void hmac_sha256(const uint8_t *key, size_t key_length,
                 const uint8_t *message, size_t message_length,
                 uint8_t digest[32]);
void hmac_hex8(const char *key, const char *message, char code[9]);

#endif