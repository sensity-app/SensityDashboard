#!/bin/bash

###############################################################################
# Translation Checker Script
# Finds untranslated hardcoded strings in React components
###############################################################################

FRONTEND_DIR="./frontend/src"
EN_JSON="./frontend/src/i18n/locales/en.json"
CS_JSON="./frontend/src/i18n/locales/cs.json"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}╔══════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║           Translation Audit Report                          ║${NC}"
echo -e "${BLUE}╚══════════════════════════════════════════════════════════════╝${NC}"
echo

# Find hardcoded English strings in JSX
echo -e "${YELLOW}[1/3] Scanning for hardcoded strings in JSX...${NC}"
echo

# Look for common patterns of hardcoded strings that should be translated
PATTERNS=(
    ">\s*[A-Z][a-z]+.*<"              # Text between tags
    "placeholder=['\"][A-Z][^'\"]*"    # Placeholder attributes
    "title=['\"][A-Z][^'\"]*"          # Title attributes
    "aria-label=['\"][A-Z][^'\"]*"     # Aria labels
)

ISSUES_FOUND=0

for file in $(find "$FRONTEND_DIR/pages" "$FRONTEND_DIR/components" -name "*.jsx" -o -name "*.js" 2>/dev/null); do
    # Skip test files and node_modules
    if [[ "$file" == *"test"* ]] || [[ "$file" == *"node_modules"* ]]; then
        continue
    fi

    # Look for suspicious hardcoded strings
    SUSPICIOUS=$(grep -n -E "(>[A-Z][a-z]{2,}|placeholder=|title=|aria-label=)" "$file" | \
                 grep -v "t(" | \
                 grep -v "import" | \
                 grep -v "className" | \
                 grep -v "http" | \
                 grep -v "API" | \
                 grep -v "JSON" | \
                 grep -v "UUID" | \
                 head -20)

    if [[ -n "$SUSPICIOUS" ]]; then
        echo -e "${RED}⚠ Possible untranslated strings in: ${NC}$(basename $file)"
        echo "$SUSPICIOUS" | while read line; do
            echo -e "${YELLOW}  Line: $line${NC}"
        done
        echo
        ((ISSUES_FOUND++))
    fi
done

if [[ $ISSUES_FOUND -eq 0 ]]; then
    echo -e "${GREEN}✓ No obvious untranslated strings found${NC}"
fi

echo

# Check for translation keys that exist in EN but not in CS
echo -e "${YELLOW}[2/3] Checking for missing Czech translations...${NC}"
echo

if [[ ! -f "$EN_JSON" ]] || [[ ! -f "$CS_JSON" ]]; then
    echo -e "${RED}✗ Translation files not found${NC}"
    exit 1
fi

# Extract all translation keys from EN (simple approach - won't catch nested)
EN_KEYS=$(grep -o '"[^"]*":' "$EN_JSON" | tr -d '":' | sort | uniq)
CS_KEYS=$(grep -o '"[^"]*":' "$CS_JSON" | tr -d '":' | sort | uniq)

MISSING_IN_CS=0
for key in $EN_KEYS; do
    if ! grep -q "\"$key\":" "$CS_JSON"; then
        if [[ $MISSING_IN_CS -eq 0 ]]; then
            echo -e "${RED}Missing in Czech translation:${NC}"
        fi
        echo -e "  ${YELLOW}• $key${NC}"
        ((MISSING_IN_CS++))
    fi
done

if [[ $MISSING_IN_CS -eq 0 ]]; then
    echo -e "${GREEN}✓ All English keys have Czech translations${NC}"
else
    echo -e "${RED}✗ Found $MISSING_IN_CS missing keys in Czech${NC}"
fi

echo

# Check translation usage
echo -e "${YELLOW}[3/3] Checking translation key usage...${NC}"
echo

# Find translation keys that are defined but never used
UNUSED_KEYS=0
for key in $EN_KEYS; do
    # Skip common structural keys
    if [[ "$key" =~ ^(title|description|name|label)$ ]]; then
        continue
    fi

    # Search for usage in source files
    if ! grep -r "t('.*$key" "$FRONTEND_DIR" --include="*.jsx" --include="*.js" -q 2>/dev/null; then
        if ! grep -r "t(\".*$key" "$FRONTEND_DIR" --include="*.jsx" --include="*.js" -q 2>/dev/null; then
            if [[ $UNUSED_KEYS -eq 0 ]]; then
                echo -e "${BLUE}Potentially unused translation keys:${NC}"
            fi
            echo -e "  ${BLUE}• $key${NC}"
            ((UNUSED_KEYS++))

            # Limit output
            if [[ $UNUSED_KEYS -ge 20 ]]; then
                echo -e "  ${BLUE}... and more${NC}"
                break
            fi
        fi
    fi
done

if [[ $UNUSED_KEYS -eq 0 ]]; then
    echo -e "${GREEN}✓ All keys appear to be used${NC}"
fi

echo
echo -e "${BLUE}╔══════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║                    Summary                                   ║${NC}"
echo -e "${BLUE}╚══════════════════════════════════════════════════════════════╝${NC}"
echo -e "Files with possible issues: ${YELLOW}$ISSUES_FOUND${NC}"
echo -e "Missing Czech translations: ${YELLOW}$MISSING_IN_CS${NC}"
echo -e "Potentially unused keys:    ${BLUE}$UNUSED_KEYS${NC}"
echo

if [[ $ISSUES_FOUND -gt 0 ]] || [[ $MISSING_IN_CS -gt 0 ]]; then
    echo -e "${YELLOW}⚠ Translation issues found - please review${NC}"
    exit 1
else
    echo -e "${GREEN}✅ No critical translation issues found${NC}"
    exit 0
fi
