ifndef FXCGSDK
$(error Set FXCGSDK to the extracted PrizmSDK directory)
endif

include $(FXCGSDK)/toolchain/prizm_rules

TARGET := POCKET
BUILD := build
SOURCES := .
DATA :=
INCLUDES := .

MKG3AFLAGS := -n basic:POCKET
CFLAGS := -Os -Wall -Wextra $(MACHDEP) $(INCLUDE) -ffunction-sections -fdata-sections
LD := $(CC)
LDFLAGS := $(MACHDEP) -T$(FXCGSDK)/toolchain/prizm.x -Wl,-static -Wl,-gc-sections
LIBS := -lc -lfxcg -lgcc
LIBDIRS :=

ifeq ($(BUILDING),)
export OUTPUT := ../$(TARGET)
export VPATH := ..
export DEPSDIR := .
export CFILES := $(notdir $(wildcard $(SOURCES)/*.c))
export OFILES := $(CFILES:.c=.o)
export INCLUDE := -I.. -I. $(if $(FXCG_INCLUDE),-I$(FXCG_INCLUDE)) -I$(LIBFXCG_INC)
export LIBPATHS := -L$(LIBFXCG_LIB)

.PHONY: all clean
all: $(BUILD)
	@$(MAKE) --no-print-directory -C "$(BUILD)" -f ../Makefile BUILDING=1

$(BUILD):
	@mkdir -p $@

clean:
	@rm -rf "$(BUILD)" "$(TARGET).bin" "$(TARGET).g3a"
else
DEPENDS := $(OFILES:.o=.d)

$(OUTPUT).g3a: $(OUTPUT).bin
$(OUTPUT).bin: $(OFILES)

-include $(DEPENDS)
endif