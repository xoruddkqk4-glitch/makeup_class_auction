/**
 * 홍익_보강 지원 (Google Apps Script Backend)
 * 
 * 구글 스프레드시트 연동:
 * - Spreadsheet ID: 1LsST_QqLkRIDQNvbeXw5EeCncJCEEOqAsC2duSngOcM
 * - 보강내역 시트: 홍익-보강 알리미 공유 확정 DB
 * - 보강지원 시트: 미신청 보강 지원 DB
 */

// 기본 연결 구글 스프레드시트 ID
var DEFAULT_SPREADSHEET_ID = '1LsST_QqLkRIDQNvbeXw5EeCncJCEEOqAsC2duSngOcM';

function doGet(e) {
  var htmlOutput = HtmlService.createTemplateFromFile('index').evaluate();
  htmlOutput
    .setTitle('홍익 보강 지원 시스템 | 온라인 교무실')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1.0');
  return htmlOutput;
}

/**
 * 구글 스프레드시트 객체를 가져오거나 자동 생성/설정합니다.
 */
function getDbSpreadsheet() {
  var scriptProperties = PropertiesService.getScriptProperties();
  var ssId = scriptProperties.getProperty('SPREADSHEET_ID') || DEFAULT_SPREADSHEET_ID;
  var ss;

  if (ssId) {
    try {
      ss = SpreadsheetApp.openById(ssId);
    } catch (e) {
      ss = null;
    }
  }

  if (!ss) {
    try {
      ss = SpreadsheetApp.getActiveSpreadsheet();
    } catch (e) {
      ss = null;
    }
  }

  if (!ss) {
    ss = SpreadsheetApp.create('보강알리미_DB');
    scriptProperties.setProperty('SPREADSHEET_ID', ss.getId());
  }

  // 1. '보강내역' 시트 확인 및 생성 (알리미 연동 DB)
  var mainSheet = ss.getSheetByName('보강내역');
  if (!mainSheet) {
    mainSheet = ss.insertSheet('보강내역');
  }
  if (mainSheet.getLastRow() === 0) {
    mainSheet.appendRow(['ID', '날짜', '교시', '교실', '보강교과', '원교사', '보강교사', '사유', '등록시각', '확인여부', '긴급여부', '삭제여부']);
    mainSheet.getRange(1, 1, 1, 12).setFontWeight('bold').setBackground('#006b67').setFontColor('#ffffff');
    mainSheet.setFrozenRows(1);
  } else {
    if (mainSheet.getLastColumn() < 12 || mainSheet.getRange(1, 12).getValue() === '') {
      mainSheet.getRange(1, 12).setValue('삭제여부').setFontWeight('bold').setBackground('#006b67').setFontColor('#ffffff');
    }
  }

  // 2. '보강지원' 시트 확인 및 생성 (미신청 사전 계획 보강 지원 DB)
  var auctionSheet = ss.getSheetByName('보강지원') || ss.getSheetByName('보강경매');
  if (!auctionSheet) {
    auctionSheet = ss.insertSheet('보강지원');
  } else if (auctionSheet.getName() === '보강경매') {
    try {
      auctionSheet.setName('보강지원');
    } catch (e) {
      // 시트명 변경 중 예외 처리
    }
  }
  if (auctionSheet.getLastRow() === 0) {
    auctionSheet.appendRow(['ID', '날짜', '교시', '교실', '보강교과', '원교사', '사유', '등록시각', '보강교사', '수업계확인', '삭제여부']);
    auctionSheet.getRange(1, 1, 1, 11).setFontWeight('bold').setBackground('#4f46e5').setFontColor('#ffffff');
    auctionSheet.setFrozenRows(1);
  } else {
    if (auctionSheet.getLastColumn() < 11 || auctionSheet.getRange(1, 11).getValue() === '') {
      auctionSheet.getRange(1, 11).setValue('삭제여부').setFontWeight('bold').setBackground('#4f46e5').setFontColor('#ffffff');
    }
  }

  return {
    ss: ss,
    mainSheet: mainSheet,
    auctionSheet: auctionSheet
  };
}

/**
 * 날짜 객체 또는 문자열을 YYYY-MM-DD 포맷으로 변환하는 헬퍼 함수
 */
function formatDateString(val) {
  if (!val) return '';
  if (val instanceof Date) {
    return Utilities.formatDate(val, Session.getScriptTimeZone() || 'Asia/Seoul', 'yyyy-MM-dd');
  }
  var str = String(val).trim();
  if (str.indexOf('GMT') !== -1 || str.indexOf('한국 표준시') !== -1 || str.indexOf('T') !== -1) {
    var d = new Date(str);
    if (!isNaN(d.getTime())) {
      return Utilities.formatDate(d, Session.getScriptTimeZone() || 'Asia/Seoul', 'yyyy-MM-dd');
    }
  }
  var match = str.match(/^(\d{4})[-.\/]?(\d{2})[-.\/]?(\d{2})/);
  if (match) {
    return match[1] + '-' + match[2] + '-' + match[3];
  }
  return str;
}

/**
 * 보강 날짜 기준 전날 13:00 마감 Date 객체 계산
 */
function getDeadlineDate(dateStr) {
  var formatted = formatDateString(dateStr);
  var parts = formatted.split('-');
  if (parts.length !== 3) return null;
  var year = parseInt(parts[0], 10);
  var month = parseInt(parts[1], 10) - 1;
  var day = parseInt(parts[2], 10);
  
  // 보강 날짜 하루 전 13:00:00
  return new Date(year, month, day - 1, 13, 0, 0);
}

var CACHE_KEY = 'AUCTION_RECORDS_JSON_CACHE';
var CACHE_TTL = 30; // 30초 캐시 유효 시간

/**
 * 캐시를 초기화합니다 (데이터 추가/수정/삭제/신청/승인 시 호출)
 */
function clearAuctionCache() {
  try {
    CacheService.getScriptCache().remove(CACHE_KEY);
  } catch (e) {
    Logger.log('Cache clear warning: ' + e.toString());
  }
}

/**
 * 현재 보강 지원 목록을 조회합니다. (CacheService 30ms 초고속 캐싱 적용)
 * - 유효성 검사 및 정렬 수행
 * - 보강 날짜 지난 항목: '보강지원' 시트에서 자동 정리
 */
function getAuctionRecords(bypassCache) {
  try {
    // 1. 캐시 검사 (bypassCache가 true가 아니면 CacheService에서 즉시 반환)
    if (!bypassCache) {
      var cachedJson = CacheService.getScriptCache().get(CACHE_KEY);
      if (cachedJson) {
        try {
          return JSON.parse(cachedJson);
        } catch (e) {
          // JSON 파싱 실패 시 시트 직접 읽기로 전환
        }
      }
    }

    var db = getDbSpreadsheet();
    var sheet = db.auctionSheet;
    var data = sheet.getDataRange().getValues();
    if (data.length <= 1) {
      CacheService.getScriptCache().put(CACHE_KEY, JSON.stringify([]), CACHE_TTL);
      return [];
    }

    var timeZone = Session.getScriptTimeZone() || 'Asia/Seoul';
    var now = new Date();
    var todayStr = Utilities.formatDate(now, timeZone, 'yyyy-MM-dd');

    var records = [];
    var rowsToDelete = [];

    for (var i = 1; i < data.length; i++) {
      var row = data[i];
      if (!row[0]) continue; // ID 없는 행 스킵

      var rowDateStr = formatDateString(row[1]);

      // 삭제 처리된 행은 웹 화면에서 제외 (Soft Delete)
      var isDeleted = (row[10] === true || String(row[10]).toLowerCase() === 'true' || String(row[10]) === 'y');
      if (isDeleted) continue;

      // 1. 날짜가 지난 미신청 보강 목록은 자동 삭제 대상
      if (rowDateStr < todayStr) {
        rowsToDelete.push(i + 1); // 1-indexed row number
        continue;
      }

      // 2. 전날 13시 마감 여부 계산
      var deadline = getDeadlineDate(rowDateStr);
      var isClosed = false;
      if (deadline && now.getTime() >= deadline.getTime()) {
        isClosed = true;
      }

      var subTeacher = row[8] ? String(row[8]).trim() : '';
      var academicAppr = (row[9] === true || String(row[9]).toLowerCase() === 'true');

      records.push({
        id: String(row[0]),
        date: rowDateStr,
        period: String(row[2]),
        className: String(row[3]),
        subject: String(row[4] || ''),
        originalTeacher: String(row[5] || ''),
        reason: String(row[6] || ''),
        timestamp: row[7] ? String(row[7]) : '',
        substituteTeacher: subTeacher,
        academicApproval: academicAppr,
        isClosed: isClosed,
        deadlineText: deadline ? Utilities.formatDate(deadline, timeZone, 'MM/dd 13:00') : ''
      });
    }

    // 날짜 asc, 교시 asc 정렬
    records.sort(function(a, b) {
      if (a.date !== b.date) {
        return a.date < b.date ? -1 : 1;
      }
      var pA = parseInt(a.period) || 0;
      var pB = parseInt(b.period) || 0;
      return pA - pB;
    });

    // 2. 캐시에 저장 (30초 동안 시트 재조회 없이 30ms 내 초고속 응답)
    try {
      CacheService.getScriptCache().put(CACHE_KEY, JSON.stringify(records), CACHE_TTL);
    } catch (e) {
      Logger.log('Cache put warning: ' + e.toString());
    }

    // 날짜 지난 항목은 시트 행을 지우지 않고 '삭제여부'를 true로 설정 (Soft Delete)
    if (rowsToDelete.length > 0) {
      for (var d = 0; d < rowsToDelete.length; d++) {
        sheet.getRange(rowsToDelete[d], 11).setValue(true);
      }
      SpreadsheetApp.flush();
    }

    return records;
  } catch (err) {
    Logger.log('Error in getAuctionRecords: ' + err.toString());
    throw new Error('보강 지원 목록을 불러오는데 실패했습니다: ' + err.message);
  }
}

/**
 * 신규 보강 지원 항목을 등록합니다. (사전 계획 보강 전용)
 * 제한 조건:
 * - 당일 5교시 ~ 7교시 등록 불가 ('마감 시간이 초과되어 등록할 수 없습니다.')
 * - 익일(다음날) 1교시 ~ 4교시 등록 불가 ('마감 시간이 초과되어 등록할 수 없습니다.')
 */
function addAuctionRecord(record) {
  try {
    if (!record.date || !record.period || !record.className || !record.subject || !record.originalTeacher) {
      throw new Error('필수 입력 항목(날짜, 교시, 교실, 보강교과, 결강교사)이 누락되었습니다.');
    }

    var db = getDbSpreadsheet();
    var sheet = db.auctionSheet;

    var formattedDate = formatDateString(record.date);
    var now = new Date();
    var timeZone = Session.getScriptTimeZone() || 'Asia/Seoul';
    var todayStr = Utilities.formatDate(now, timeZone, 'yyyy-MM-dd');

    var tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    var tomorrowStr = Utilities.formatDate(tomorrow, timeZone, 'yyyy-MM-dd');

    // 교시 숫자 추출
    var periodNum = parseInt(String(record.period).replace(/[^0-9]/g, ''), 10) || 0;

    // 이미 지난 날짜 등록 방지
    if (formattedDate < todayStr) {
      throw new Error('이미 지난 날짜의 수업은 보강 지원으로 등록할 수 없습니다.');
    }

    // 1. 당일 5교시 ~ 7교시 등록 제한
    if (formattedDate === todayStr && periodNum >= 5) {
      throw new Error('마감 시간이 초과되어 등록할 수 없습니다.');
    }

    // 2. 익일(다음날) 1교시 ~ 4교시 등록 제한
    if (formattedDate === tomorrowStr && periodNum >= 1 && periodNum <= 4) {
      throw new Error('마감 시간이 초과되어 등록할 수 없습니다.');
    }

    var newId = 'AUC-' + now.getTime() + '-' + Math.floor(Math.random() * 1000);
    var nowIso = now.toISOString();

    sheet.appendRow([
      newId,
      formattedDate,
      record.period,
      record.className,
      record.subject,
      record.originalTeacher,
      record.reason || '',
      nowIso,
      '',    // 보강교사 (초기 빈값)
      false, // 수업계확인 (기본 false)
      false  // 삭제여부 (기본 false)
    ]);

    SpreadsheetApp.flush();
    clearAuctionCache();

    return {
      success: true,
      id: newId,
      message: '보강 지원 수업이 성공적으로 등록되었습니다.'
    };
  } catch (err) {
    Logger.log('Error in addAuctionRecord: ' + err.toString());
    return {
      success: false,
      message: err.message || '등록 중 오류가 발생했습니다.'
    };
  }
}

/**
 * 보강 지원을 신청(접수) 또는 취소합니다.
 * - 바로 '보강내역'으로 넘기지 않고, '보강지원' 시트의 '보강교사' 정보를 갱신합니다.
 * - substituteTeacher가 빈값인 경우 신청 취소 처리됩니다.
 */
function claimAuctionRecord(auctionId, substituteTeacher) {
  try {
    if (!auctionId) {
      throw new Error('등록 ID가 누락되었습니다.');
    }

    var db = getDbSpreadsheet();
    var auctionSheet = db.auctionSheet;
    var data = auctionSheet.getDataRange().getValues();

    var foundIndex = -1;
    var targetRow = null;

    for (var i = 1; i < data.length; i++) {
      if (String(data[i][0]) === String(auctionId)) {
        foundIndex = i + 1; // 1-indexed
        targetRow = data[i];
        break;
      }
    }

    if (foundIndex === -1 || !targetRow) {
      return { success: false, message: '해당 보강 지원 항목을 찾을 수 없습니다.' };
    }

    var dateStr = formatDateString(targetRow[1]);
    var now = new Date();

    // 전날 13시 경과 검사
    var deadline = getDeadlineDate(dateStr);
    if (deadline && now.getTime() >= deadline.getTime()) {
      return { success: false, message: '해당 보강 지원건은 전날 13시가 지나 처리가 마감되었습니다.' };
    }

    var cleanTeacherName = substituteTeacher ? String(substituteTeacher).trim() : '';

    // 보강지원 시트에 보강교사 업데이트 및 수업계확인 false 유지
    auctionSheet.getRange(foundIndex, 9).setValue(cleanTeacherName); // 9번째 열: 보강교사
    auctionSheet.getRange(foundIndex, 10).setValue(false);            // 10번째 열: 수업계확인
    SpreadsheetApp.flush();
    clearAuctionCache();

    if (cleanTeacherName) {
      return {
        success: true,
        message: '[' + cleanTeacherName + '] 선생님의 보강 신청이 접수되었습니다. (수업계 확인 후 알리미로 연동됩니다)'
      };
    } else {
      return {
        success: true,
        message: '보강 신청이 취소되었습니다.'
      };
    }
  } catch (err) {
    Logger.log('Error in claimAuctionRecord: ' + err.toString());
    return {
      success: false,
      message: err.message || '신청 처리 중 오류가 발생했습니다.'
    };
  }
}

/**
 * 업무 담당자가 '수업계 확인' 토글을 변경할 때 실행됩니다.
 * - isApproved가 true일 때: '보강내역'(보강 알리미 공유 시트)으로 데이터 이관 및 '보강지원' 시트에서 삭제
 * - isApproved가 false일 때: '보강지원' 시트의 수업계확인 필드만 false로 유지
 */
function toggleAcademicApproval(auctionId, isApproved) {
  try {
    var db = getDbSpreadsheet();
    var auctionSheet = db.auctionSheet;
    var mainSheet = db.mainSheet;
    var data = auctionSheet.getDataRange().getValues();

    var foundIndex = -1;
    var targetRow = null;

    for (var i = 1; i < data.length; i++) {
      if (String(data[i][0]) === String(auctionId)) {
        foundIndex = i + 1; // 1-indexed
        targetRow = data[i];
        break;
      }
    }

    if (foundIndex === -1 || !targetRow) {
      return { success: false, message: '해당 보강 지원 항목을 찾을 수 없습니다.' };
    }

    var substituteTeacher = targetRow[8] ? String(targetRow[8]).trim() : '';

    if (isApproved) {
      if (!substituteTeacher) {
        return { success: false, message: '보강 신청 교사 성명이 입력되지 않은 항목은 수업계 확인을 완료할 수 없습니다.' };
      }

      var dateStr = formatDateString(targetRow[1]);
      var now = new Date();
      var subId = 'SUB-' + now.getTime() + '-' + Math.floor(Math.random() * 1000);
      var period = String(targetRow[2]);
      var className = String(targetRow[3]);
      var subject = String(targetRow[4] || '');
      var originalTeacher = String(targetRow[5] || '');
      var reason = String(targetRow[6] || '');
      var nowIso = now.toISOString();

      // 1. 보강내역 시트로 데이터 이관 (확인여부 true: 수업계 확인 완료 연동, 삭제여부 false)
      mainSheet.appendRow([
        subId,
        dateStr,
        period,
        className,
        subject,
        originalTeacher,
        substituteTeacher,
        reason,
        nowIso,
        true,  // 확인여부 true
        false, // 긴급여부 false
        false  // 삭제여부 false
      ]);

      // 2. 보강지원 시트에서 이관 완료 처리 (Soft Delete)
      auctionSheet.getRange(foundIndex, 11).setValue(true);
      SpreadsheetApp.flush();
      clearAuctionCache();

      return {
        success: true,
        transferred: true,
        message: '수업계 확인 완료! [' + substituteTeacher + '] 선생님 보강건이 보강 알리미로 성공적으로 이관되었습니다.'
      };
    } else {
      // 수업계 확인 해제 (false)
      auctionSheet.getRange(foundIndex, 10).setValue(false);
      SpreadsheetApp.flush();
      clearAuctionCache();

      return {
        success: true,
        transferred: false,
        message: '수업계 확인이 미확인 상태로 변경되었습니다.'
      };
    }
  } catch (err) {
    Logger.log('Error in toggleAcademicApproval: ' + err.toString());
    return { success: false, message: err.message || '수업계 확인 처리 중 오류가 발생했습니다.' };
  }
}

/**
 * 등록자가 보강 지원 항목을 취소/삭제합니다.
 */
function deleteAuctionRecord(auctionId) {
  try {
    var db = getDbSpreadsheet();
    var sheet = db.auctionSheet;
    var data = sheet.getDataRange().getValues();

    for (var i = 1; i < data.length; i++) {
      if (String(data[i][0]) === String(auctionId)) {
        auctionSheet.getRange(i + 1, 11).setValue(true);
        SpreadsheetApp.flush();
        clearAuctionCache();
        return { success: true, message: '보강 지원 등록이 취소/삭제되었습니다. (시트 데이터는 영구 보존됩니다)' };
      }
    }
    return { success: false, message: '해당 보강 지원 항목을 찾을 수 없습니다.' };
  } catch (err) {
    Logger.log('Error in deleteAuctionRecord: ' + err.toString());
    return { success: false, message: err.message };
  }
}

/**
 * 등록자가 보강 지원 항목을 수정합니다. (마감 기한 항목도 수정 가능)
 */
function updateAuctionRecord(record) {
  try {
    if (!record.id || !record.date || !record.period || !record.className || !record.subject || !record.originalTeacher) {
      throw new Error('필수 입력 항목(날짜, 교시, 교실, 보강교과, 결강교사)이 누락되었습니다.');
    }

    var db = getDbSpreadsheet();
    var sheet = db.auctionSheet;
    var data = sheet.getDataRange().getValues();

    var formattedDate = formatDateString(record.date);

    for (var i = 1; i < data.length; i++) {
      if (String(data[i][0]) === String(record.id)) {
        var rowIndex = i + 1; // 1-indexed
        sheet.getRange(rowIndex, 2).setValue(formattedDate);
        sheet.getRange(rowIndex, 3).setValue(record.period);
        sheet.getRange(rowIndex, 4).setValue(record.className);
        sheet.getRange(rowIndex, 5).setValue(record.subject);
        sheet.getRange(rowIndex, 6).setValue(record.originalTeacher);
        sheet.getRange(rowIndex, 7).setValue(record.reason || '');
        SpreadsheetApp.flush();
        clearAuctionCache();
        return { success: true, message: '보강 지원 항목이 성공적으로 수정되었습니다.' };
      }
    }
    return { success: false, message: '수정할 보강 지원 항목을 찾을 수 없습니다.' };
  } catch (err) {
    Logger.log('Error in updateAuctionRecord: ' + err.toString());
    return { success: false, message: err.message || '수정 중 오류가 발생했습니다.' };
  }
}

/**
 * 이미 확정된 전체 보강내역 조회 API (홍익-보강 알리미 연동 확인용)
 */
function getConfirmedRecords() {
  try {
    var db = getDbSpreadsheet();
    var sheet = db.mainSheet;
    var data = sheet.getDataRange().getValues();
    if (data.length <= 1) return [];

    var records = [];
    for (var i = 1; i < data.length; i++) {
      var row = data[i];
      if (!row[0]) continue;

      // 삭제 처리된 이관 내역 제외
      var isDeleted = (row[11] === true || String(row[11]).toLowerCase() === 'true' || String(row[11]) === 'y');
      if (isDeleted) continue;

      records.push({
        id: String(row[0]),
        date: formatDateString(row[1]),
        period: String(row[2]),
        className: String(row[3]),
        subject: String(row[4] || ''),
        originalTeacher: String(row[5] || ''),
        substituteTeacher: String(row[6] || ''),
        reason: String(row[7] || ''),
        timestamp: row[8] ? String(row[8]) : '',
        confirmed: (row[9] === true || String(row[9]).toLowerCase() === 'true'),
        urgent: (row[10] === true || String(row[10]).toLowerCase() === 'true')
      });
    }

    records.sort(function(a, b) {
      if (a.date !== b.date) {
        return a.date > b.date ? -1 : 1;
      }
      var pA = parseInt(a.period) || 0;
      var pB = parseInt(b.period) || 0;
      return pA - pB;
    });

    return records;
  } catch (err) {
    Logger.log('Error in getConfirmedRecords: ' + err.toString());
    return [];
  }
}

/**
 * 자동 정리 트리거 함수 (Apps Script 시간 기반 트리거용)
 */
function autoCleanupAuctions() {
  Logger.log('Running autoCleanupAuctions...');
  getAuctionRecords();
}

/**
 * '태그관리' 시트에서 보강 교과 및 보강 유발 사유 태그 목록을 조회합니다.
 * (구글 시트 구조: 구분[SUBJECT/REASON] | 태그명 | 등록시각)
 */
function getTagsFromSheet() {
  try {
    var scriptProperties = PropertiesService.getScriptProperties();
    var ssId = scriptProperties.getProperty('SPREADSHEET_ID') || DEFAULT_SPREADSHEET_ID;
    var ss;
    try {
      ss = SpreadsheetApp.openById(ssId);
    } catch (e) {
      ss = SpreadsheetApp.getActiveSpreadsheet();
    }
    
    var sheet = ss.getSheetByName('태그관리');
    var nowIso = new Date().toISOString();
    var defaultSubjects = ['국어', '수학', '영어', '사회', '과학', '체육', '음악', '미술', '정보', '세계 문화와 영어A'];
    var defaultReasons = ['출장', '연가', '병가', '공가', '특별휴가', '조퇴', '외출', '지참'];

    if (!sheet) {
      sheet = ss.insertSheet('태그관리');
      sheet.appendRow(['구분', '태그명', '등록시각']);
      sheet.getRange(1, 1, 1, 3).setFontWeight('bold').setBackground('#4f46e5').setFontColor('#ffffff');
      for (var s = 0; s < defaultSubjects.length; s++) {
        sheet.appendRow(['SUBJECT', defaultSubjects[s], nowIso]);
      }
      for (var r = 0; r < defaultReasons.length; r++) {
        sheet.appendRow(['REASON', defaultReasons[r], nowIso]);
      }
      SpreadsheetApp.flush();
    }
    
    var lastRow = sheet.getLastRow();
    var subjectTags = [];
    var reasonTags = [];
    
    if (lastRow > 1) {
      var data = sheet.getDataRange().getValues();
      var col1Header = String(data[0][0] || '').trim();
      var col2Header = String(data[0][1] || '').trim();
      
      for (var i = 1; i < data.length; i++) {
        var type = String(data[i][0] || '').trim().toUpperCase();
        var val = String(data[i][1] || '').trim();
        
        if (!type && !val) continue;
        
        if ((type === 'SUBJECT' || type.indexOf('교과') !== -1 || type.indexOf('SUBJECT') !== -1) && val) {
          if (subjectTags.indexOf(val) === -1) subjectTags.push(val);
        } else if ((type === 'REASON' || type.indexOf('사유') !== -1 || type.indexOf('REASON') !== -1) && val) {
          if (reasonTags.indexOf(val) === -1) reasonTags.push(val);
        } else if (col1Header.indexOf('보강교과') !== -1 || col2Header.indexOf('보강사유') !== -1) {
          var subj = String(data[i][0] || '').trim();
          var reas = String(data[i][1] || '').trim();
          if (subj && subjectTags.indexOf(subj) === -1) subjectTags.push(subj);
          if (reas && reasonTags.indexOf(reas) === -1) reasonTags.push(reas);
        }
      }
    }
    
    if (subjectTags.length === 0) {
      subjectTags = defaultSubjects;
    }
    if (reasonTags.length === 0) {
      reasonTags = defaultReasons;
    }
    
    return {
      success: true,
      subjectTags: subjectTags,
      reasonTags: reasonTags
    };
  } catch (e) {
    Logger.log('Error in getTagsFromSheet: ' + e.toString());
    return {
      success: false,
      error: e.toString(),
      subjectTags: ['국어', '수학', '영어', '사회', '과학', '체육', '음악', '미술', '정보', '세계 문화와 영어A'],
      reasonTags: ['출장', '연가', '병가', '공가', '특별휴가', '조퇴', '외출', '지참']
    };
  }
}

/**
 * '태그관리' 시트에 보강 교과 및 보강 유발 사유 태그 목록을 저장합니다.
 * (구조: 구분[SUBJECT/REASON] | 태그명 | 등록시각)
 */
function saveTagsToSheet(subjectTags, reasonTags) {
  try {
    var scriptProperties = PropertiesService.getScriptProperties();
    var ssId = scriptProperties.getProperty('SPREADSHEET_ID') || DEFAULT_SPREADSHEET_ID;
    var ss;
    try {
      ss = SpreadsheetApp.openById(ssId);
    } catch (e) {
      ss = SpreadsheetApp.getActiveSpreadsheet();
    }
    
    var sheet = ss.getSheetByName('태그관리');
    if (!sheet) {
      sheet = ss.insertSheet('태그관리');
    }
    sheet.clearContents();
    
    sheet.getRange(1, 1, 1, 3).setValues([['구분', '태그명', '등록시각']]).setFontWeight('bold').setBackground('#4f46e5').setFontColor('#ffffff');
    
    var sTags = Array.isArray(subjectTags) ? subjectTags : [];
    var rTags = Array.isArray(reasonTags) ? reasonTags : [];
    var nowIso = new Date().toISOString();
    var rows = [];
    
    for (var s = 0; s < sTags.length; s++) {
      var sVal = String(sTags[s] || '').trim();
      if (sVal) rows.push(['SUBJECT', sVal, nowIso]);
    }
    for (var r = 0; r < rTags.length; r++) {
      var rVal = String(rTags[r] || '').trim();
      if (rVal) rows.push(['REASON', rVal, nowIso]);
    }
    
    if (rows.length > 0) {
      sheet.getRange(2, 1, rows.length, 3).setValues(rows);
    }
    SpreadsheetApp.flush();
    return { success: true };
  } catch (e) {
    Logger.log('Error in saveTagsToSheet: ' + e.toString());
    return { success: false, error: e.toString() };
  }
}
