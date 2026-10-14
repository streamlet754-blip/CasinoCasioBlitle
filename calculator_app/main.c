#include <fxcg/display.h>
#include <fxcg/keyboard.h>
#include <fxcg/rtc.h>

#include <stdlib.h>
#include <string.h>

#include "crypto.h"

static const char MASTER_SECRET[] = "YOUR_SHARED_SECRET_KEY";
static const unsigned int STARTING_CHIPS = 1000u;
static const unsigned int WAGER_CHIPS = 25u;
static const unsigned int MAX_DEMO_CENTS = 10000000u;
static char active_session[9];
static unsigned int balance_chips;
static int pass_active;

static char *append_text(char *output, const char *text)
{
    const size_t length = strlen(text);
    memcpy(output, text, length);
    return output + length;
}

static char *append_unsigned(char *output, unsigned int value, unsigned int minimum_width)
{
    char digits[10];
    unsigned int length = 0;
    unsigned int index;

    do {
        digits[length++] = (char)('0' + value % 10u);
        value /= 10u;
    } while (value > 0u);
    while (length < minimum_width) {
        digits[length++] = '0';
    }
    for (index = 0; index < length; ++index) {
        output[index] = digits[length - index - 1u];
    }
    return output + length;
}

static void format_euro_amount(char output[20], unsigned int cents)
{
    char *cursor = append_unsigned(output, cents / 100u, 1u);
    *cursor++ = '.';
    cursor = append_unsigned(cursor, cents % 100u, 2u);
    *cursor = '\0';
}

static void add_virtual_chips(unsigned int chips)
{
    if (chips > MAX_DEMO_CENTS - balance_chips) {
        balance_chips = MAX_DEMO_CENTS;
    } else {
        balance_chips += chips;
    }
}

static void clear_screen(const char *title)
{
    Bdisp_AllClr_VRAM();
    PrintXY(3, 1, "POCKET ARCADE", TEXT_MODE_NORMAL, TEXT_COLOR_WHITE);
    PrintXY(17, 1, "DEMO", TEXT_MODE_NORMAL, TEXT_COLOR_CYAN);
    PrintXY(3, 2, title, TEXT_MODE_NORMAL, TEXT_COLOR_CYAN);
    PrintXY(3, 3, "VIRTUAL ONLY", TEXT_MODE_NORMAL, TEXT_COLOR_YELLOW);
}

static int wait_key(void)
{
    int key = 0;
    GetKey(&key);
    return key;
}

static void pause_short(void)
{
    volatile unsigned int count;
    for (count = 0; count < 18000u; ++count) {
    }
}

static void show_notice(const char *title, const char *message)
{
    clear_screen(title);
    PrintXY(3, 5, message, TEXT_MODE_NORMAL, TEXT_COLOR_WHITE);
    PrintXY(3, 7, "PRESS ANY KEY", TEXT_MODE_NORMAL, TEXT_COLOR_CYAN);
    wait_key();
}

static int is_hex_string(const char *value)
{
    unsigned int index;
    if (strlen(value) != 8u) {
        return 0;
    }
    for (index = 0; index < 8u; ++index) {
        const char character = value[index];
        if (!((character >= '0' && character <= '9')
           || (character >= 'A' && character <= 'F')
           || (character >= 'a' && character <= 'f'))) {
            return 0;
        }
    }
    return 1;
}

static void uppercase(char *value)
{
    while (*value != '\0') {
        if (*value >= 'a' && *value <= 'f') {
            *value = (char)(*value - 'a' + 'A');
        }
        ++value;
    }
}

static int read_hex_token(const char *label, char token[9])
{
    int start = 0;
    int cursor = 0;
    int key = 0;

    token[0] = '\0';
    clear_screen("ENTER DEMO PASS");
    PrintXY(3, 4, label, TEXT_MODE_NORMAL, TEXT_COLOR_CYAN);
    PrintXY(3, 5, "8 HEX CHARS - EXE", TEXT_MODE_NORMAL, TEXT_COLOR_WHITE);
    PrintXY(3, 6, "EXIT CANCELS", TEXT_MODE_NORMAL, TEXT_COLOR_WHITE);
    DisplayMBString((unsigned char *)token, start, cursor, 3, 7);

    for (;;) {
        GetKey(&key);
        if (key == KEY_CTRL_EXE) {
            uppercase(token);
            return is_hex_string(token);
        }
        if (key == KEY_CTRL_EXIT) {
            return 0;
        }
        if (key && key < 30000) {
            cursor = EditMBStringChar((unsigned char *)token, 8, cursor, key);
        } else {
            EditMBStringCtrl((unsigned char *)token, 8, &start, &cursor, &key, 3, 7);
        }
        DisplayMBString((unsigned char *)token, start, cursor, 3, 7);
    }
}

static int redeem_demo_pass(void)
{
    static const char *amounts[] = { "10.00", "20.00", "50.00" };
    char session_id[9];
    char supplied_code[9];
    char message[32];
    char expected_code[9];
    int key;
    unsigned int selection;

    clear_screen("STARTING VALUE");
    PrintXY(3, 4, "1   EUR 10", TEXT_MODE_NORMAL, TEXT_COLOR_WHITE);
    PrintXY(3, 5, "2   EUR 20", TEXT_MODE_NORMAL, TEXT_COLOR_WHITE);
    PrintXY(3, 6, "3   EUR 50", TEXT_MODE_NORMAL, TEXT_COLOR_WHITE);
    PrintXY(3, 7, "1-3 PICK / EXIT", TEXT_MODE_NORMAL, TEXT_COLOR_CYAN);
    for (;;) {
        key = wait_key();
        if (key == KEY_CTRL_EXIT) {
            return 0;
        }
        if (key >= KEY_CHAR_1 && key <= KEY_CHAR_3) {
            selection = (unsigned int)(key - KEY_CHAR_1);
            break;
        }
    }

    if (!read_hex_token("SESSION ID", session_id)
        || !read_hex_token("DEMO CODE", supplied_code)) {
        clear_screen("PASS NOT ACCEPTED");
        PrintXY(3, 4, "PASS INPUT INVALID", TEXT_MODE_NORMAL, TEXT_COLOR_RED);
        PrintXY(3, 7, "PRESS ANY KEY", TEXT_MODE_NORMAL, TEXT_COLOR_CYAN);
        wait_key();
        return 0;
    }

    strcpy(message, session_id);
    strcat(message, ":");
    strcat(message, amounts[selection]);
    hmac_hex8(MASTER_SECRET, message, expected_code);
    if (memcmp(expected_code, supplied_code, 8u) != 0) {
        clear_screen("PASS NOT ACCEPTED");
        PrintXY(3, 4, "CODE DOES NOT MATCH", TEXT_MODE_NORMAL, TEXT_COLOR_RED);
        PrintXY(3, 7, "PRESS ANY KEY", TEXT_MODE_NORMAL, TEXT_COLOR_CYAN);
        wait_key();
        return 0;
    }

    memcpy(active_session, session_id, sizeof(active_session));
    balance_chips = STARTING_CHIPS * (selection == 0u ? 1u : selection == 1u ? 2u : 5u);
    pass_active = 1;
    clear_screen("PASS ACCEPTED");
    PrintXY(3, 4, "CREDITS LOADED", TEXT_MODE_NORMAL, TEXT_COLOR_GREEN);
    PrintXY(3, 7, "PRESS ANY KEY", TEXT_MODE_NORMAL, TEXT_COLOR_CYAN);
    wait_key();
    return 1;
}

static void print_balance(unsigned int chips)
{
    char line[32];
    {
        char *cursor = append_text(line, "CREDITS  ");
        cursor = append_unsigned(cursor, chips, 1u);
        *cursor = '\0';
    }
    PrintXY(3, 4, line, TEXT_MODE_NORMAL, TEXT_COLOR_GREEN);
}

static void play_crash(void)
{
    unsigned int multiplier = 10u;
    const unsigned int crash_point = 11u + (unsigned int)(rand() % 40);
    char line[32];

    if (balance_chips < WAGER_CHIPS) {
        show_notice("CRASH", "NOT ENOUGH CREDITS");
        return;
    }
    balance_chips -= WAGER_CHIPS;

    for (;;) {
        clear_screen("CRASH / VIRTUAL");
        print_balance(balance_chips);
        {
            char *cursor = append_text(line, "MULTIPLIER ");
            cursor = append_unsigned(cursor, multiplier / 10u, 1u);
            *cursor++ = '.';
            cursor = append_unsigned(cursor, multiplier % 10u, 1u);
            *cursor++ = 'x';
            *cursor = '\0';
        }
        PrintXY(3, 5, line, TEXT_MODE_NORMAL, TEXT_COLOR_CYAN);
        PrintXY(3, 6, "1 CASH OUT   2 PUSH", TEXT_MODE_NORMAL, TEXT_COLOR_GREEN);
        PrintXY(3, 7, "EXIT CANCELS ROUND", TEXT_MODE_NORMAL, TEXT_COLOR_WHITE);

        {
            const int key = wait_key();
            if (key == KEY_CTRL_EXIT) {
                return;
            }
            if (key == KEY_CHAR_1) {
                add_virtual_chips((WAGER_CHIPS * multiplier) / 10u);
                return;
            }
            if (key == KEY_CHAR_2) {
                ++multiplier;
                if (multiplier >= crash_point) {
                    clear_screen("ROUND CRASHED");
                    PrintXY(3, 4, "WAGER LOST", TEXT_MODE_NORMAL, TEXT_COLOR_RED);
                    PrintXY(3, 7, "PRESS ANY KEY", TEXT_MODE_NORMAL, TEXT_COLOR_CYAN);
                    wait_key();
                    return;
                }
            }
        }
    }
}

static void play_plinko(void)
{
    unsigned int left_turns = 0;
    unsigned int row;
    unsigned int multiplier_tenths;
    char path[12];
    char line[32];

    if (balance_chips < WAGER_CHIPS) {
        show_notice("PLINKO", "NOT ENOUGH CREDITS");
        return;
    }
    balance_chips -= WAGER_CHIPS;
    path[0] = '\0';

    for (row = 0; row < 8u; ++row) {
        const char direction = (rand() & 1) ? 'R' : 'L';
        const size_t length = strlen(path);
        path[length] = direction;
        path[length + 1u] = '\0';
        if (direction == 'L') {
            ++left_turns;
        }
        clear_screen("PLINKO / VIRTUAL");
        print_balance(balance_chips);
        PrintXY(3, 5, "BALL PATH", TEXT_MODE_NORMAL, TEXT_COLOR_CYAN);
        PrintXY(3, 6, path, TEXT_MODE_NORMAL, TEXT_COLOR_YELLOW);
        PrintXY(3, 7, "BALL IN MOTION", TEXT_MODE_NORMAL, TEXT_COLOR_WHITE);
        pause_short();
    }

    if (left_turns == 0u || left_turns == 8u) {
        multiplier_tenths = 40u;
    } else if (left_turns == 1u || left_turns == 7u) {
        multiplier_tenths = 20u;
    } else if (left_turns == 2u || left_turns == 6u) {
        multiplier_tenths = 15u;
    } else {
        multiplier_tenths = 10u;
    }
    add_virtual_chips((WAGER_CHIPS * multiplier_tenths) / 10u);
    clear_screen("PLINKO RESULT");
    {
        char *cursor = append_text(line, "PATH: ");
        cursor = append_unsigned(cursor, left_turns, 1u);
        cursor = append_text(cursor, " LEFT");
        *cursor = '\0';
    }
    PrintXY(3, 5, line, TEXT_MODE_NORMAL, TEXT_COLOR_WHITE);
    {
        char *cursor = append_text(line, "RETURN: ");
        cursor = append_unsigned(cursor, multiplier_tenths / 10u, 1u);
        *cursor++ = '.';
        cursor = append_unsigned(cursor, multiplier_tenths % 10u, 1u);
        *cursor++ = 'x';
        *cursor = '\0';
    }
    PrintXY(3, 6, line, TEXT_MODE_NORMAL, TEXT_COLOR_GREEN);
    print_balance(balance_chips);
    PrintXY(3, 7, "PRESS ANY KEY", TEXT_MODE_NORMAL, TEXT_COLOR_CYAN);
    wait_key();
}

static void play_mines(void)
{
    unsigned int mine;
    int key;
    char line[32];

    if (balance_chips < WAGER_CHIPS) {
        show_notice("MINES", "NOT ENOUGH CREDITS");
        return;
    }
    balance_chips -= WAGER_CHIPS;
    mine = (unsigned int)(rand() % 9);
    clear_screen("MINES / VIRTUAL");
    PrintXY(3, 4, "1      2      3", TEXT_MODE_NORMAL, TEXT_COLOR_WHITE);
    PrintXY(3, 5, "4      5      6", TEXT_MODE_NORMAL, TEXT_COLOR_WHITE);
    PrintXY(3, 6, "7      8      9", TEXT_MODE_NORMAL, TEXT_COLOR_WHITE);
    PrintXY(3, 7, "CHOOSE TILE 1-9", TEXT_MODE_NORMAL, TEXT_COLOR_CYAN);
    key = wait_key();
    if (key >= KEY_CHAR_1 && key <= KEY_CHAR_9) {
        const unsigned int choice = (unsigned int)(key - KEY_CHAR_1);
        if (choice == mine) {
            clear_screen("MINE FOUND");
            PrintXY(3, 5, "WAGER LOST", TEXT_MODE_NORMAL, TEXT_COLOR_RED);
        } else {
            add_virtual_chips(WAGER_CHIPS * 2u);
            clear_screen("SAFE PICK");
            PrintXY(3, 5, "VIRTUAL WIN: 2.00x", TEXT_MODE_NORMAL, TEXT_COLOR_GREEN);
        }
    } else {
        char *cursor = append_text(line, "TILE ");
        cursor = append_unsigned(cursor, mine + 1u, 1u);
        cursor = append_text(cursor, " WAS A MINE");
        *cursor = '\0';
        clear_screen("ROUND ENDED");
        PrintXY(3, 5, line, TEXT_MODE_NORMAL, TEXT_COLOR_RED);
    }
    print_balance(balance_chips);
    PrintXY(3, 7, "PRESS ANY KEY", TEXT_MODE_NORMAL, TEXT_COLOR_CYAN);
    wait_key();
}

static void show_demo_receipt(void)
{
    char amount[20];
    char message[32];
    char exit_code[9];

    format_euro_amount(amount, balance_chips);
    strcpy(message, active_session);
    strcat(message, ":");
    strcat(message, amount);
    hmac_hex8(MASTER_SECRET, message, exit_code);

    clear_screen("DEMO RECEIPT");
    {
        char line[32];
        char *cursor = append_text(line, "ID: ");
        cursor = append_text(cursor, active_session);
        *cursor = '\0';
        PrintXY(3, 4, line, TEXT_MODE_NORMAL, TEXT_COLOR_WHITE);
    }
    {
        char line[32];
        char *cursor = append_text(line, "EUR: ");
        cursor = append_text(cursor, amount);
        *cursor = '\0';
        PrintXY(3, 5, line, TEXT_MODE_NORMAL, TEXT_COLOR_CYAN);
    }
    {
        char line[32];
        char *cursor = append_text(line, "EXIT: ");
        cursor = append_text(cursor, exit_code);
        *cursor = '\0';
        PrintXY(3, 6, line, TEXT_MODE_NORMAL, TEXT_COLOR_GREEN);
    }
    PrintXY(3, 7, "DEMO ONLY - PRESS", TEXT_MODE_NORMAL, TEXT_COLOR_YELLOW);
    wait_key();
}

static void show_menu(void)
{
    clear_screen("CHOOSE YOUR GAME");
    if (pass_active) {
        print_balance(balance_chips);
    } else {
        PrintXY(3, 4, "NO ACTIVE DEMO PASS", TEXT_MODE_NORMAL, TEXT_COLOR_RED);
    }
    PrintXY(3, 5, "1 CRASH   2 PLINKO", TEXT_MODE_NORMAL, TEXT_COLOR_WHITE);
    PrintXY(3, 6, "3 MINES   4 PASS", TEXT_MODE_NORMAL, TEXT_COLOR_WHITE);
    PrintXY(3, 7, "5 RECEIPT  EXIT", TEXT_MODE_NORMAL, TEXT_COLOR_CYAN);
}

int main(void)
{
    int key;
    Bdisp_EnableColor(0);
    Bdisp_AllClr_VRAM();
    srand((unsigned int)RTC_GetTicks());

    clear_screen("WELCOME");
    PrintXY(3, 4, "CRASH PLINKO MINES", TEXT_MODE_NORMAL, TEXT_COLOR_WHITE);
    PrintXY(3, 5, "DEMO ARCADE", TEXT_MODE_NORMAL, TEXT_COLOR_GREEN);
    PrintXY(3, 6, "NO REAL MONEY", TEXT_MODE_NORMAL, TEXT_COLOR_YELLOW);
    PrintXY(3, 7, "PRESS ANY KEY", TEXT_MODE_NORMAL, TEXT_COLOR_CYAN);
    wait_key();

    for (;;) {
        show_menu();
        key = wait_key();
        if (key == KEY_CTRL_EXIT || key == KEY_CTRL_AC) {
            break;
        }
        if (key == KEY_CHAR_4) {
            redeem_demo_pass();
        } else if (key == KEY_CHAR_1 && pass_active) {
            play_crash();
        } else if (key == KEY_CHAR_2 && pass_active) {
            play_plinko();
        } else if (key == KEY_CHAR_3 && pass_active) {
            play_mines();
        } else if (key == KEY_CHAR_5 && pass_active) {
            show_demo_receipt();
        } else if ((key >= KEY_CHAR_1 && key <= KEY_CHAR_3) || key == KEY_CHAR_5) {
            show_notice("DEMO PASS REQUIRED", "PRESS 4 FOR A PASS");
        }
    }

    Bdisp_AllClr_VRAM();
    return 0;
}