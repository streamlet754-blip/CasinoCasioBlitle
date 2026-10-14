#include "crypto.h"

#include <string.h>

typedef struct {
    uint32_t state[8];
    uint32_t bit_count_high;
    uint32_t bit_count_low;
    uint8_t block[64];
    size_t block_length;
} sha256_context;

static const uint32_t round_constants[64] = {
    0x428a2f98u, 0x71374491u, 0xb5c0fbcfu, 0xe9b5dba5u,
    0x3956c25bu, 0x59f111f1u, 0x923f82a4u, 0xab1c5ed5u,
    0xd807aa98u, 0x12835b01u, 0x243185beu, 0x550c7dc3u,
    0x72be5d74u, 0x80deb1feu, 0x9bdc06a7u, 0xc19bf174u,
    0xe49b69c1u, 0xefbe4786u, 0x0fc19dc6u, 0x240ca1ccu,
    0x2de92c6fu, 0x4a7484aau, 0x5cb0a9dcu, 0x76f988dau,
    0x983e5152u, 0xa831c66du, 0xb00327c8u, 0xbf597fc7u,
    0xc6e00bf3u, 0xd5a79147u, 0x06ca6351u, 0x14292967u,
    0x27b70a85u, 0x2e1b2138u, 0x4d2c6dfcu, 0x53380d13u,
    0x650a7354u, 0x766a0abbu, 0x81c2c92eu, 0x92722c85u,
    0xa2bfe8a1u, 0xa81a664bu, 0xc24b8b70u, 0xc76c51a3u,
    0xd192e819u, 0xd6990624u, 0xf40e3585u, 0x106aa070u,
    0x19a4c116u, 0x1e376c08u, 0x2748774cu, 0x34b0bcb5u,
    0x391c0cb3u, 0x4ed8aa4au, 0x5b9cca4fu, 0x682e6ff3u,
    0x748f82eeu, 0x78a5636fu, 0x84c87814u, 0x8cc70208u,
    0x90befffau, 0xa4506cebu, 0xbef9a3f7u, 0xc67178f2u
};

static uint32_t rotate_right(uint32_t value, unsigned int count)
{
    return (value >> count) | (value << (32u - count));
}

static void sha256_transform(sha256_context *context, const uint8_t block[64])
{
    uint32_t words[64];
    uint32_t a, b, c, d, e, f, g, h;
    unsigned int index;

    for (index = 0; index < 16; ++index) {
        const unsigned int offset = index * 4u;
        words[index] = ((uint32_t)block[offset] << 24)
                     | ((uint32_t)block[offset + 1u] << 16)
                     | ((uint32_t)block[offset + 2u] << 8)
                     | (uint32_t)block[offset + 3u];
    }
    for (; index < 64; ++index) {
        const uint32_t x = words[index - 15u];
        const uint32_t y = words[index - 2u];
        const uint32_t sigma0 = rotate_right(x, 7) ^ rotate_right(x, 18) ^ (x >> 3);
        const uint32_t sigma1 = rotate_right(y, 17) ^ rotate_right(y, 19) ^ (y >> 10);
        words[index] = words[index - 16u] + sigma0 + words[index - 7u] + sigma1;
    }

    a = context->state[0];
    b = context->state[1];
    c = context->state[2];
    d = context->state[3];
    e = context->state[4];
    f = context->state[5];
    g = context->state[6];
    h = context->state[7];

    for (index = 0; index < 64; ++index) {
        const uint32_t sum1 = rotate_right(e, 6) ^ rotate_right(e, 11) ^ rotate_right(e, 25);
        const uint32_t choose = (e & f) ^ (~e & g);
        const uint32_t temp1 = h + sum1 + choose + round_constants[index] + words[index];
        const uint32_t sum0 = rotate_right(a, 2) ^ rotate_right(a, 13) ^ rotate_right(a, 22);
        const uint32_t majority = (a & b) ^ (a & c) ^ (b & c);
        const uint32_t temp2 = sum0 + majority;

        h = g;
        g = f;
        f = e;
        e = d + temp1;
        d = c;
        c = b;
        b = a;
        a = temp1 + temp2;
    }

    context->state[0] += a;
    context->state[1] += b;
    context->state[2] += c;
    context->state[3] += d;
    context->state[4] += e;
    context->state[5] += f;
    context->state[6] += g;
    context->state[7] += h;
}

static void sha256_init(sha256_context *context)
{
    static const uint32_t initial_state[8] = {
        0x6a09e667u, 0xbb67ae85u, 0x3c6ef372u, 0xa54ff53au,
        0x510e527fu, 0x9b05688cu, 0x1f83d9abu, 0x5be0cd19u
    };
    memcpy(context->state, initial_state, sizeof(initial_state));
    context->bit_count_high = 0;
    context->bit_count_low = 0;
    context->block_length = 0;
}

static void sha256_update(sha256_context *context, const uint8_t *data, size_t length)
{
    size_t index;

    for (index = 0; index < length; ++index) {
        context->block[context->block_length++] = data[index];
        if (context->block_length == sizeof(context->block)) {
            const uint32_t previous_bit_count = context->bit_count_low;
            sha256_transform(context, context->block);
            context->bit_count_low += 512u;
            if (context->bit_count_low < previous_bit_count) {
                ++context->bit_count_high;
            }
            context->block_length = 0;
        }
    }
}

static void sha256_final(sha256_context *context, uint8_t digest[32])
{
    size_t index;
    const uint32_t previous_bit_count = context->bit_count_low;
    context->bit_count_low += (uint32_t)context->block_length * 8u;
    if (context->bit_count_low < previous_bit_count) {
        ++context->bit_count_high;
    }
    context->block[context->block_length++] = 0x80u;

    if (context->block_length > 56u) {
        while (context->block_length < 64u) {
            context->block[context->block_length++] = 0;
        }
        sha256_transform(context, context->block);
        context->block_length = 0;
    }
    while (context->block_length < 56u) {
        context->block[context->block_length++] = 0;
    }
    for (index = 0; index < 8; ++index) {
        if (index < 4u) {
            context->block[63u - index] = (uint8_t)(context->bit_count_low >> (index * 8u));
            context->block[59u - index] = (uint8_t)(context->bit_count_high >> (index * 8u));
        }
    }
    sha256_transform(context, context->block);

    for (index = 0; index < 8; ++index) {
        digest[index * 4u] = (uint8_t)(context->state[index] >> 24);
        digest[index * 4u + 1u] = (uint8_t)(context->state[index] >> 16);
        digest[index * 4u + 2u] = (uint8_t)(context->state[index] >> 8);
        digest[index * 4u + 3u] = (uint8_t)context->state[index];
    }
}

void hmac_sha256(const uint8_t *key, size_t key_length,
                 const uint8_t *message, size_t message_length,
                 uint8_t digest[32])
{
    uint8_t key_block[64] = { 0 };
    uint8_t inner_pad[64];
    uint8_t outer_pad[64];
    uint8_t inner_digest[32];
    sha256_context context;
    size_t index;

    if (key_length > sizeof(key_block)) {
        sha256_init(&context);
        sha256_update(&context, key, key_length);
        sha256_final(&context, key_block);
    } else if (key_length > 0) {
        memcpy(key_block, key, key_length);
    }

    for (index = 0; index < sizeof(key_block); ++index) {
        inner_pad[index] = (uint8_t)(key_block[index] ^ 0x36u);
        outer_pad[index] = (uint8_t)(key_block[index] ^ 0x5cu);
    }

    sha256_init(&context);
    sha256_update(&context, inner_pad, sizeof(inner_pad));
    sha256_update(&context, message, message_length);
    sha256_final(&context, inner_digest);

    sha256_init(&context);
    sha256_update(&context, outer_pad, sizeof(outer_pad));
    sha256_update(&context, inner_digest, sizeof(inner_digest));
    sha256_final(&context, digest);
}

void hmac_hex8(const char *key, const char *message, char code[9])
{
    static const char hex[] = "0123456789ABCDEF";
    uint8_t digest[32];
    size_t index;

    hmac_sha256((const uint8_t *)key, strlen(key),
                (const uint8_t *)message, strlen(message), digest);
    for (index = 0; index < 4; ++index) {
        code[index * 2u] = hex[digest[index] >> 4];
        code[index * 2u + 1u] = hex[digest[index] & 0x0fu];
    }
    code[8] = '\0';
}